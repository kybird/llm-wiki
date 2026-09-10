// llm-wiki skills — 외부 스킬 레포를 git 채널로 받아 온다 (plan.md 6.2, 6.5).
// npm publish와 스킬 배포를 분리하는 것이 목적: 프롬프트 오타 하나 고치려고 버전을
// 올리는 일이 없어야 스킬이 썩지 않는다.
//
//   skills add <url>      llm-wiki.config.json의 skills.sources에 소스 등록
//   skills remove <url>   등록 해제
//   skills list           등록된 소스 목록
//   skills sync           얕은 clone → SKILL.md 단위 스킬 발견 → diff 제시 →
//                         승인(--yes 또는 프롬프트) 후 .agents/skills + .claude/skills에 복사
//
// 6.5 원칙: 남의 스킬을 sync하는 건 그 사람이 쓴 지시를 내 에이전트가 따르게 하는 것 —
// sync는 항상 명시적으로 치는 명령이고, diff를 보여주고 승인받는다. 받은 스킬은 참조가
// 아니라 레포로 **복사**한다(6.2): clone 한 번으로 자기완결적이어야 한다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const readline = require('readline');

// init.js와 같은 설치 대상 — 에이전트 CLI별로 읽는 위치가 다르다.
const SKILL_TARGETS = ['.agents/skills', '.claude/skills'];

// ── config (llm-wiki.config.json) ──
// loadConfig(find-doc-root)는 알려진 키만 병합하므로, skills 키는 여기서 직접
// 다룬다. 쓰기는 다른 키(projectName 등)를 보존해야 한다 — 원본 JSON을 읽어
// skills 키만 갈아끼운다.
function configCandidates(docRoot) {
  return [
    path.join(process.cwd(), 'llm-wiki.config.json'),
    docRoot ? path.join(docRoot, '..', 'llm-wiki.config.json') : null,
  ].filter(Boolean);
}

function readRawConfig(cfgPath) {
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
}

function skillsConfig(cfgPath) {
  const raw = readRawConfig(cfgPath);
  const skills = raw.skills || {};
  return {
    sources: Array.isArray(skills.sources) ? skills.sources : [],
    // enabled: 없으면 전부 설치. 있으면 그 이름의 스킬만 sync 대상(선택 UI는 6.6 과제).
    enabled: Array.isArray(skills.enabled) ? skills.enabled : null,
  };
}

function writeSkillsConfig(cfgPath, { sources, enabled }) {
  const raw = readRawConfig(cfgPath);
  raw.skills = { sources };
  if (enabled !== null) raw.skills.enabled = enabled;
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2) + '\n');
}

// owner/repo 축약형은 GitHub HTTPS로 정규화. 그 외(git@, https://, 로컬 경로)는 그대로.
function normalizeSourceUrl(url) {
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url) && !url.includes('\\')) {
    return `https://github.com/${url}.git`;
  }
  return url;
}

// ── git 접근 ──
// 로컬 경로 clone에는 --depth가 무시돼 경고가 나므로 로컬이면 플래그를 뺀다.
function isLocalPath(url) {
  return /^[A-Za-z]:[\\/]/.test(url) || url.startsWith('file://') || url.startsWith('/');
}

function cloneShallow(url, destDir) {
  const args = ['clone', '--quiet'];
  if (!isLocalPath(url)) args.push('--depth', '1');
  args.push(url, destDir);
  execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

// ── 스킬 발견 ──
// 스킬 = SKILL.md를 포함한 디렉토리. 스킬 레포 관례(루트에 스킬 디렉토리 나열)를
// 따르되, 루트 자체가 SKILL.md를 갖는 단일 스킬 레포도 허용한다.
function discoverSkills(repoDir, repoName) {
  const found = []; // { name, dir } — name은 SKILL.md 소유 디렉토리명
  const skip = new Set(['.git', 'node_modules']);
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'SKILL.md') {
        found.push({ name: path.basename(dir), dir });
      }
    }
  };
  walk(repoDir);
  // 루트가 단일 스킬이면 디렉토리명이 clone 임시명이라 소스 레포명으로 바꾼다.
  const rootSkill = found.find(s => s.dir === repoDir);
  if (rootSkill && found.length === 1) rootSkill.name = repoName;
  return found;
}

function listFilesRecursive(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFilesRecursive(full, base));
    else files.push(path.relative(base, full));
  }
  return files;
}

// ── diff (표시용 경량 LCS — 스킬 프롬프트는 수백 줄 이하) ──
function diffLines(oldText, newText) {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  // LCS 테이블
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: ' ', s: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: '-', s: a[i] }); i++; }
    else { out.push({ t: '+', s: b[j] }); j++; }
  }
  while (i < n) { out.push({ t: '-', s: a[i++] }); }
  while (j < m) { out.push({ t: '+', s: b[j++] }); }
  return out;
}

const DIFF_LINE_CAP = 60; // 파일당 표시 한도 — 넘으면 잘렸다고 알린다

function printFileDiff(relPath, oldText, newText) {
  const diff = diffLines(oldText, newText);
  const changed = diff.filter(d => d.t !== ' ');
  if (changed.length === 0) return;
  console.log(`  ── ${relPath} (${changed.length} 줄 변경) ──`);
  let shown = 0;
  for (const line of diff) {
    if (line.t === ' ') continue;
    if (shown >= DIFF_LINE_CAP) {
      console.log(`  … (${diff.length - shown}줄 더, 생략)`);
      break;
    }
    console.log(`  ${line.t} ${line.s}`);
    shown++;
  }
}

// ── 설치 계획/실행 ──
// 파일별 판정: new(신규 설치) / same(동일) / changed(내용 상이 — diff 제시 대상).
// 사용자가 손댄 복사본 보호는 init의 마커 규칙과 달리 정의하지 않는다: 외부 스킬에는
// skill-version 마커가 없는 것이 정상이고, 6.5의 승인 절차가 곧 보호다(변경은 diff로
// 보여주고 소스가 이긴다는 것을 승인받는다).
function planSkillInstall(skillDir, skillName, targets, cwd) {
  const files = listFilesRecursive(skillDir);
  const plan = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(skillDir, rel), 'utf8');
    for (const target of targets) {
      const dest = path.join(cwd, target, skillName, rel);
      let status;
      if (!fs.existsSync(dest)) status = 'new';
      else status = fs.readFileSync(dest, 'utf8') === src ? 'same' : 'changed';
      plan.push({ rel, skillName, target, dest, src, status });
    }
  }
  return plan;
}

function applyPlan(plan) {
  for (const item of plan) {
    if (item.status === 'same') continue;
    fs.mkdirSync(path.dirname(item.dest), { recursive: true });
    fs.writeFileSync(item.dest, item.src);
  }
}

// ── 승인 (6.5) ──
// --yes: 리뷰 후 명시 재실행(무인 에이전트 포함). TTY면 y/N 프롬프트.
// --yes도 TTY도 아니면 거절 — 비대화형 파이프에서 몰래 설치되는 일은 없게 한다.
async function confirmInstall(assumeYes, label) {
  if (assumeYes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(`\n✋ ${label}: 설치하려면 diff를 검토한 뒤 --yes 로 재실행하라 (6.5 — 승인 없는 설치 없음).`);
    return false;
  }
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n${label} — 설치할까요? [y/N] `, ans => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

// ── 명령 구현 ──
function cmdAdd(url, docRoot) {
  if (!url) {
    console.error('usage: llm-wiki skills add <git-url | owner/repo>');
    process.exitCode = 1;
    return;
  }
  const normalized = normalizeSourceUrl(url);
  const cfgPath = configCandidates(docRoot).find(p => fs.existsSync(p)) || configCandidates(docRoot)[0];
  const cfg = skillsConfig(cfgPath);
  if (cfg.sources.includes(normalized)) {
    console.log(`이미 등록된 소스다: ${normalized}`);
    return;
  }
  cfg.sources.push(normalized);
  writeSkillsConfig(cfgPath, cfg);
  console.log(`✓ 등록: ${normalized} → ${path.relative(process.cwd(), cfgPath)}`);
  console.log(`  받기: llm-wiki skills sync`);
}

function cmdRemove(url, docRoot) {
  if (!url) {
    console.error('usage: llm-wiki skills remove <git-url | owner/repo>');
    process.exitCode = 1;
    return;
  }
  const normalized = normalizeSourceUrl(url);
  const cfgPath = configCandidates(docRoot).find(p => fs.existsSync(p));
  if (!cfgPath) {
    console.log('등록된 소스가 없다.');
    return;
  }
  const cfg = skillsConfig(cfgPath);
  if (!cfg.sources.includes(normalized)) {
    console.log(`등록되지 않은 소스다: ${normalized}`);
    return;
  }
  cfg.sources = cfg.sources.filter(s => s !== normalized);
  writeSkillsConfig(cfgPath, cfg);
  console.log(`✓ 해제: ${normalized}`);
}

function cmdList(docRoot) {
  const cfgPath = configCandidates(docRoot).find(p => fs.existsSync(p));
  const cfg = skillsConfig(cfgPath || configCandidates(docRoot)[0]);
  if (cfg.sources.length === 0) {
    console.log('등록된 스킬 소스가 없다 — llm-wiki skills add <git-url>');
    return;
  }
  console.log('스킬 소스:');
  for (const s of cfg.sources) console.log(`  • ${s}`);
  if (cfg.enabled) console.log(`설치 제한(enabled): ${cfg.enabled.join(', ')}`);
}

async function cmdSync({ assumeYes, onlySkill, docRoot }) {
  const cwd = process.cwd();
  const cfgPath = configCandidates(docRoot).find(p => fs.existsSync(p));
  const cfg = skillsConfig(cfgPath || configCandidates(docRoot)[0]);
  if (cfg.sources.length === 0) {
    console.log('등록된 소스가 없다 — llm-wiki skills add <git-url>');
    return;
  }

  for (const source of cfg.sources) {
    console.log(`\n▶ ${source}`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-wiki-skills-'));
    // dest를 명시한 clone은 tmp 자체가 레포 루트다. 루트 단일 스킬의 이름은
    // 소스 URL 마지막 세그먼트에서 뽑는다(임시 디렉토리명이 스킬명이 되는 일 방지).
    const repoName = source.replace(/[\/\\]$/, '').split(/[\/\\]/).pop().replace(/\.git$/, '');
    try {
      cloneShallow(source, tmp);
    } catch (e) {
      console.error(`  ✗ clone 실패: ${e.message.split('\n')[0]}`);
      fs.rmSync(tmp, { recursive: true, force: true });
      continue;
    }
    const repoDir = tmp;

    let skills = discoverSkills(repoDir, repoName);
    if (skills.length === 0) {
      console.log('  ✗ SKILL.md가 없다 — 스킬 레포가 아니다.');
      continue;
    }
    if (cfg.enabled && cfg.enabled.length > 0) {
      skills = skills.filter(s => cfg.enabled.includes(s.name));
    }
    if (onlySkill) {
      skills = skills.filter(s => s.name === onlySkill);
      if (skills.length === 0) {
        console.log(`  ✗ 스킬 '${onlySkill}' 없음 (발견됨: ${discoverSkills(repoDir, repoName).map(s => s.name).join(', ')})`);
        continue;
      }
    }

    let installedAny = false;
    for (const skill of skills) {
      const plan = planSkillInstall(skill.dir, skill.name, SKILL_TARGETS, cwd);
      const changed = plan.filter(p => p.status !== 'same');
      const news = plan.filter(p => p.status === 'new');
      const chg = plan.filter(p => p.status === 'changed');
      console.log(`  • ${skill.name}: 신규 ${news.length} · 변경 ${chg.length} · 동일 ${plan.length - changed.length} (설치처: ${SKILL_TARGETS.join(', ')})`);
      // 타겟 2곳(.agents/.claude)의 내용은 항상 같으므로 diff는 파일당 한 번만.
      const seenRel = new Set();
      for (const item of chg) {
        if (seenRel.has(item.rel)) continue;
        seenRel.add(item.rel);
        printFileDiff(path.join(skill.name, item.rel), fs.readFileSync(item.dest, 'utf8'), item.src);
      }
      if (changed.length === 0) {
        console.log('    변동 없음 — 설치 생략.');
        continue;
      }
      const ok = await confirmInstall(assumeYes, `    ${skill.name} ${chg.length > 0 ? '덮어쓰기 포함' : '신규'} 설치`);
      if (!ok) {
        console.log('    건너뜀.');
        continue;
      }
      applyPlan(changed);
      installedAny = true;
      console.log(`    ✓ 설치 → ${SKILL_TARGETS.join(', ')}/${skill.name}/`);
    }
    if (!installedAny) console.log('  (설치된 스킬 없음)');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function dispatch(args, docRoot) {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'add': cmdAdd(rest[0], docRoot); break;
    case 'remove': cmdRemove(rest[0], docRoot); break;
    case 'list': cmdList(docRoot); break;
    case 'sync':
      await cmdSync({
        assumeYes: rest.includes('--yes'),
        onlySkill: rest.includes('--skill') ? rest[rest.indexOf('--skill') + 1] : null,
        docRoot,
      });
      break;
    default:
      console.error(`Unknown skills subcommand: ${sub || '(없음)'}\nusage: llm-wiki skills add <url> | remove <url> | list | sync [--yes] [--skill <name>]`);
      process.exitCode = 1;
  }
}

module.exports = { dispatch };

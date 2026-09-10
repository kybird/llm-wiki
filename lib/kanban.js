// kanban 코어 — 카드당 파일 저장소 + 유도 뷰용 조회 유틸 (개선계획 2단계).
// 설계 근거: improvement-plan.md §3 (plan.md 3.5/3.7 확정 위에 세운 조합).
//   - 저장 형태: 카드당 파일. 상태(frontmatter)와 내용(본문)이 같은 파일에 있고,
//     종결(done/superseded/abandoned)은 폴더가 말한다. board 뷰는 유도물이다.
//   - 카드 쓰기는 CLI만 — 사람 손편집 round-trip(1,250줄 파서의 원인)을 처음부터 포기.
//     사람은 읽기만. 섹션 경계는 센티넬 주석(<!-- kanban:…:begin/end -->)으로 정확히 자른다.
//   - 클레임 = 만료 있는 협동 락(기본 1h). 에이전트가 밤에 죽어도 클레임이 자연 만료되어
//     재집기 가능 — 스테일 락 청소가 필요 없다.
//   - 파일 락은 잠금 폴더의 mkdir 원자성으로 (Windows 호환 — chmod/flock 안 씀).
//   - 제목이 곧 식별자 (3.5 확정). 파일명은 제목을 슬러그화한 것.
const fs = require('fs');
const path = require('path');

// 활성 카드의 상태 — cards/ 폴더 안에서 frontmatter status로 구분된다.
const ACTIVE_STATUSES = ['todo', 'doing', 'review'];
// 종결 상태는 폴더가 말한다 (plan.md 3.1: 완료/대체/폐기 세 갈래).
const TERMINAL_FOLDERS = ['done', 'superseded', 'abandoned'];

// 보드 기본 설정 — board.yml이 있으면 그 파일이 이긴다.
const DEFAULT_CONFIG = {
  statuses: ACTIVE_STATUSES,
  wipLimits: { doing: 2 },
  claimTimeoutMinutes: 60, // 클레임 만료 — 밤샘 루프의 죽은 세션 자동 회수
};

// 잠금 폴더가 이보다 오래됐으면 프로세스가 죽은 것으로 보고 강탈한다.
const LOCK_STALE_MS = 15 * 1000;
// 활동 로그 상한 (kanban-md 방식) — 넘치면 반을 버린다.
const ACTIVITY_CAP = 10000;

// ── 경로 ────────────────────────────────────────────────────────────────

function kanbanPaths(docRoot) {
  const kanbanDir = path.join(docRoot, 'kanban');
  return {
    kanbanDir,
    cardsDir: path.join(kanbanDir, 'cards'),
    doneDir: path.join(kanbanDir, 'done'),
    supersededDir: path.join(kanbanDir, 'superseded'),
    abandonedDir: path.join(kanbanDir, 'abandoned'),
    activityPath: path.join(kanbanDir, 'activity.jsonl'),
    boardYmlPath: path.join(kanbanDir, 'board.yml'),
    lockDir: path.join(kanbanDir, '.lock'),
  };
}

// board.yml 파싱 — 필요한 키만 뽑는 축소 파서 (statuses / wip_limits.doing /
// claim_timeout_minutes). 포맷이 굳기 전까지는 yaml 의존성을 붙이지 않는다.
function loadConfig(paths) {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (!fs.existsSync(paths.boardYmlPath)) return config;
  const lines = fs.readFileSync(paths.boardYmlPath, 'utf8').split(/\r?\n/);
  let inWip = false;
  for (const line of lines) {
    const statusMatch = line.match(/^statuses:\s*\[(.*)\]/);
    if (statusMatch) {
      config.statuses = statusMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      continue;
    }
    const timeoutMatch = line.match(/^claim_timeout_minutes:\s*(\d+)/);
    if (timeoutMatch) { config.claimTimeoutMinutes = Number(timeoutMatch[1]); continue; }
    if (/^wip_limits:/.test(line)) { inWip = true; continue; }
    if (inWip) {
      const wipMatch = line.match(/^\s+(\w+):\s*(\d+)/);
      if (wipMatch) config.wipLimits[wipMatch[1]] = Number(wipMatch[2]);
      else if (line.trim() && !line.startsWith(' ')) inWip = false;
    }
  }
  return config;
}

// ── 제목 ↔ 파일명 ───────────────────────────────────────────────────────

// 제목을 파일명으로. Windows 금지문자 제거, 공백→하이픈, 한글은 살린다.
// 제목 자체가 식별자(3.5)라 슬러그는 파일시스템 편의분일 뿐 — 카드 탐색은
// frontmatter title 기준으로 한다.
function slugify(title) {
  return String(title).trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'untitled';
}

// ── 카드 파싱/직렬화 ─────────────────────────────────────────────────────

// frontmatter의 `key: value` / `key: [a, b]`만 다룬다. 중첩 없음.
function parseFrontmatter(content) {
  const meta = {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return meta;
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    const listMatch = rawValue.match(/^\[(.*)\]$/);
    if (listMatch) {
      meta[key] = listMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    } else {
      meta[key] = rawValue.trim().replace(/^["']|["']$/g, '');
    }
  }
  return meta;
}

function serializeFrontmatter(meta) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(meta)) {
    if (Array.isArray(value)) lines.push(`${key}: [${value.join(', ')}]`);
    else if (value !== undefined && value !== '') lines.push(`${key}: ${value}`);
  }
  lines.push('---');
  return lines.join('\n');
}

// 본문을 섹션들로. Goal/AC는 센티넬로 정확히 자르고, 나머지는 `## 이름` 헤더 단위.
// 반환: { goal, ac: [{checked, idx, text}], sections: Map<name, bodyText> }
function parseBody(content) {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').replace(/^\r?\n/, '');
  const card = { goal: '', ac: [], sections: new Map() };

  const goalMatch = body.match(/<!-- kanban:goal:begin -->\r?\n([\s\S]*?)<!-- kanban:goal:end -->/);
  if (goalMatch) card.goal = goalMatch[1].replace(/\r?\n$/, '');

  const acMatch = body.match(/<!-- kanban:ac:begin -->\r?\n([\s\S]*?)<!-- kanban:ac:end -->/);
  if (acMatch) {
    for (const line of acMatch[1].split(/\r?\n/)) {
      const ac = line.match(/^-\s+\[( |x)\]\s+#(\d+)\s+(.*)$/);
      if (ac) card.ac.push({ checked: ac[1] === 'x', idx: Number(ac[2]), text: ac[3] });
    }
  }

  // 센티넬 블록을 제거한 뒤 남은 `## 섹션`들을 수집 — Plan/Notes/Handoff/Result와
  // 사용자가 CLI로 넣은 기타 섹션. 센티넬 헤더(## Goal, ## Acceptance Criteria)는 건너뛴다.
  const withoutSentinels = body
    .replace(/<!-- kanban:goal:begin -->[\s\S]*?<!-- kanban:goal:end -->\r?\n?/g, '')
    .replace(/<!-- kanban:ac:begin -->[\s\S]*?<!-- kanban:ac:end -->\r?\n?/g, '');
  let current = null;
  let buffer = [];
  const flush = () => {
    if (current) card.sections.set(current, buffer.join('\n').replace(/\n+$/, ''));
  };
  for (const line of withoutSentinels.split(/\r?\n/)) {
    const header = line.match(/^##\s+(.+?)\s*$/);
    if (header) {
      flush();
      const name = header[1];
      if (name === 'Goal' || name === 'Acceptance Criteria') { current = null; buffer = []; continue; }
      current = name;
      buffer = [];
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();
  return card;
}

// CLI가 관리하는 섹션명 — 본문에 이 이름과 정확히 같은 모양의 `## ` 줄이 있으면
// 다음 파싱에서 진짜 섹션 경계로 오인된다. Notes에 `## Goal`을 적은 경우 뒷줄이
// 전부 삭제되기까지 했다(2026-09-09 리뷰 5-1-2) — append-only 계약의 정면 반례.
const MANAGED_SECTIONS = ['Goal', 'Acceptance Criteria', 'Plan', 'Notes', 'Handoff', 'Result'];

// 섹션 본문을 쓸 때 관리 섹션명과 같은 모양의 줄은 앞에 공백을 하나 붙여 이스케이프한다.
// ` ## Goal`은 `^##\s` 경계와 안 겹치므로 영구히 본문으로 남는다.
function escapeSectionBody(text) {
  if (!text) return text || '';
  return String(text).split(/\r?\n/).map(line => {
    const header = line.match(/^##\s+(.+?)\s*$/);
    return header && MANAGED_SECTIONS.includes(header[1]) ? ` ${line}` : line;
  }).join('\n');
}

// Goal/AC는 센티넬과 함께, 나머지 섹션은 헤더만으로 직렬화.
// Notes는 append-only 저널이라 CLI가 줄을 덧붙인다 — 전체를 재조립하지 않는 섹션 단위
// 재작성을 위해 항상 고정 순서(Goal, AC, Plan, Notes, Handoff, Result, 기타)로 출력.
function serializeCard(meta, parsed) {
  const out = [serializeFrontmatter(meta), ''];
  out.push('## Goal');
  out.push('<!-- kanban:goal:begin -->');
  out.push(parsed.goal || '');
  out.push('<!-- kanban:goal:end -->');
  out.push('');
  out.push('## Acceptance Criteria');
  out.push('<!-- kanban:ac:begin -->');
  for (const ac of parsed.ac) {
    out.push(`- [${ac.checked ? 'x' : ' '}] #${ac.idx} ${ac.text}`);
  }
  out.push('<!-- kanban:ac:end -->');
  out.push('');
  const order = ['Plan', 'Notes', 'Handoff', 'Result'];
  for (const name of order) {
    out.push(`## ${name}`);
    out.push(escapeSectionBody(parsed.sections.get(name)));
    out.push('');
  }
  // CLI가 모르는 섹션도 지우지 않는다 — 맨 뒤에 보존.
  for (const [name, bodyText] of parsed.sections) {
    if (order.includes(name)) continue;
    out.push(`## ${name}`);
    out.push(escapeSectionBody(bodyText));
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n');
}

// ── 카드 목록/탐색/이동 ──────────────────────────────────────────────────

function listCardsInDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(dir, f);
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        filePath,
        fileName: f,
        dir,
        meta: parseFrontmatter(content),
        card: parseBody(content),
        content,
      };
    });
}

// 모든 카드(활성 + 종결 3폴더). 종결 카드도 handoff/supersede 같은 조회·참조 대상.
function listAllCards(paths) {
  return [
    ...listCardsInDir(paths.cardsDir),
    ...listCardsInDir(paths.doneDir),
    ...listCardsInDir(paths.supersededDir),
    ...listCardsInDir(paths.abandonedDir),
  ];
}

// 제목으로 카드 찾기 — frontmatter title이 곧 식별자(3.5). 슬러그 폴백 허용.
function findCard(paths, title) {
  const cards = listAllCards(paths);
  const byTitle = cards.find(c => c.meta.title === title);
  if (byTitle) return byTitle;
  const slug = slugify(title);
  return cards.find(c => slugify(c.meta.title || c.fileName.replace(/\.md$/, '')) === slug);
}

function writeCard(cardObj, newMeta, newParsed) {
  fs.writeFileSync(cardObj.filePath, serializeCard(newMeta || cardObj.meta, newParsed || cardObj.card));
}

// 종결 이동 — 파일 이동 + frontmatter status를 폴더와 일치시킨다.
function moveCardTo(cardObj, targetDir, statusValue) {
  fs.mkdirSync(targetDir, { recursive: true });
  const content = fs.readFileSync(cardObj.filePath, 'utf8');
  const meta = parseFrontmatter(content);
  meta.status = statusValue;
  fs.writeFileSync(path.join(targetDir, cardObj.fileName), serializeCard(meta, parseBody(content)));
  fs.unlinkSync(cardObj.filePath);
}

// ── 활동 로그 ────────────────────────────────────────────────────────────

// append-only 감사로그. 10k 줄 캡 — 넘치면 오래된 절반을 버린다 (kanban-md 방식).
function appendActivity(paths, entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  if (fs.existsSync(paths.activityPath)) {
    const content = fs.readFileSync(paths.activityPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length >= ACTIVITY_CAP) {
      fs.writeFileSync(paths.activityPath, lines.slice(Math.floor(lines.length / 2)).join('\n') + '\n');
    }
  }
  fs.appendFileSync(paths.activityPath, line);
}

function readActivity(paths) {
  if (!fs.existsSync(paths.activityPath)) return [];
  return fs.readFileSync(paths.activityPath, 'utf8').split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// ── 클레임 만료 (협동 락) ────────────────────────────────────────────────

function isClaimExpired(cardObj, config, now = Date.now()) {
  if (!cardObj.meta.claimed_at) return true;
  const claimedMs = Date.parse(String(cardObj.meta.claimed_at));
  if (Number.isNaN(claimedMs)) return true;
  return now - claimedMs > config.claimTimeoutMinutes * 60 * 1000;
}

// ── 파일 락 — 잠금 폴더 mkdir 원자성 (Windows 호환) ─────────────────────

// mkdir은 이미 존재하면 EEXIST로 실패하는 원자적 연산이라 락으로 쓴다.
// 락 폴더 안 lock.json에 {pid, at}을 남겨, LOCK_STALE_MS가 지나면 강탈 허용.
function withLock(paths, name, fn) {
  const lockPath = path.join(paths.lockDir, name);
  fs.mkdirSync(paths.lockDir, { recursive: true });

  const acquire = (stolen = false) => {
    try {
      fs.mkdirSync(lockPath);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // 이미 락이 있다 — 오래됐으면 강탈 (한 번만)
      const markerPath = path.join(lockPath, 'lock.json');
      if (!stolen && fs.existsSync(markerPath)) {
        try {
          const { at } = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
          if (Date.now() - at > LOCK_STALE_MS) {
            fs.rmSync(lockPath, { recursive: true, force: true });
            return acquire(true);
          }
        } catch { /* 판정 불가 — 락 유지로 간주 */ }
      }
      return false;
    }
  };

  if (!acquire()) {
    throw new Error(`칸반 락 획득 실패: ${name} — 다른 세션이 보드를 고치는 중. 잠시 후 재시도.`);
  }
  try {
    fs.writeFileSync(path.join(lockPath, 'lock.json'), JSON.stringify({ pid: process.pid, at: Date.now() }));
    return fn();
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
}

// ── 스캐폴드 ─────────────────────────────────────────────────────────────

// doc/kanban/ 골격. init이 부르고, 이미 있으면 아무것도 덮지 않는다.
function scaffold(docRoot) {
  const paths = kanbanPaths(docRoot);
  for (const dir of [paths.kanbanDir, paths.cardsDir, paths.doneDir, paths.supersededDir, paths.abandonedDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(paths.boardYmlPath)) {
    fs.writeFileSync(paths.boardYmlPath, [
      '# 칸반 보드 설정 — 이 파일이 정본. board 뷰는 유도물이다.',
      'statuses: [todo, doing, review]   # cards/ 안의 활성 상태. 종결은 폴더(done/superseded/abandoned)가 말한다',
      'wip_limits:',
      '  doing: 2                        # 발산 방지 1차 방어 (개선계획 4-3)',
      'claim_timeout_minutes: 60         # 클레임 만료 — 죽은 세션의 카드를 자동으로 풀어준다',
      '',
    ].join('\n'));
  }
  if (!fs.existsSync(paths.activityPath)) {
    fs.writeFileSync(paths.activityPath, '');
  }
  return paths;
}

module.exports = {
  ACTIVE_STATUSES,
  TERMINAL_FOLDERS,
  DEFAULT_CONFIG,
  kanbanPaths,
  loadConfig,
  slugify,
  parseFrontmatter,
  serializeFrontmatter,
  parseBody,
  serializeCard,
  listCardsInDir,
  listAllCards,
  findCard,
  writeCard,
  moveCardTo,
  appendActivity,
  readActivity,
  isClaimExpired,
  withLock,
  scaffold,
};

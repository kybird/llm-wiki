// kanban 명령 계층 — 카드 쓰기는 전부 이 모듈의 CLI 경로로만 일어난다.
// 사람은 카드를 읽기만 하고, 에이전트는 이 명령들로만 고친다 (개선계획 §3.2).
// 서브커맨드:
//   card new "<제목>" [--goal …] [--ac … …] [--depends a,b] [--not-before YYYY-MM-DD]
//   card show <제목>
//   card edit <제목> [--goal …] [--plan …] [--ac … …] [--add-ac …] [--check-ac 1,2]
//                     [--note …] [--renew-claim] [--depends a,b] [--add-depends a,b]
//                     [--remove-depends a,b]
//   pick [--claim 이름]                       원자적 집기 (락 안에서)
//   handoff <제목> --question "…"             review로 park + 클레임 반납
//   done <제목> --result "…"                  완료 — Result 없으면 거부
//   supersede <제목> --by a,b                 대체 — 부모는 superseded/로 소멸
//   abandon <제목> --reason "…"               폐기 — 사유 없으면 거부
//   board [--json]                            유도 뷰 (컬럼/WIP/대기/만료 클레임)
// card new/edit은 모르는 플래그·값 없는 플래그·바꿀 것 없는 호출을 실패로 끝낸다 —
// no-op을 성공으로 보고하면 에이전트가 다음 단계를 거짓 전제 위에 세운다.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { findDocRoot, loadConfig } = require('./find-doc-root');
const kanban = require('./kanban');
const { localToday } = require('./local-today');

// ── 공용 ────────────────────────────────────────────────────────────────

function parseArgs(rest) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      let key; let value;
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        key = arg.slice(2, eq);
        value = arg.slice(eq + 1);
      } else {
        key = arg.slice(2);
        // 다음 토큰이 또 플래그면 값을 삼키지 않는다 — `done --result --yes`가
        // result='--yes'로 기록되던 결함(2026-09-09 리뷰 5-2). 값 자체가 --로
        // 시작해야 하면 `--result=--x` 등호 형식으로 쓴다.
        if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) {
          value = rest[i + 1];
          i++;
        } else {
          value = true; // 값 없는 플래그 — 필수 문자열 플래그에 이 값이 오면 거부된다.
        }
      }
      // 같은 플래그 반복(--ac a --ac b)은 배열로 누적.
      if (flags[key] !== undefined) {
        flags[key] = [].concat(flags[key], value);
      } else {
        flags[key] = value;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function asArray(v) {
  return v === undefined ? [] : [].concat(v);
}

// 필수 문자열 플래그 검증 — 값 없는 `--result` 등은 parseArgs가 true를 심는다.
// 그대로 쓰면 기록에 문자열 'true'가 남는다(2026-09-09 리뷰 5-2). 문자열만 통과.
function flagString(v) {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

// 선택 문자열 플래그 — 배열 원소 중 문자열만 (값 없는 반복 플래그의 true 제거).
function stringArray(v) {
  return asArray(v).filter(s => typeof s === 'string');
}

// 플래그 명세 검증 (card new/edit 공용) — 모르는 플래그와 값 없는 필수 플래그를
// 조용히 삼키면 no-op이 성공으로 보고된다(2026-09-10 접수 결함 A). 주 사용자는
// 종료 코드와 출력으로만 결과를 판단하는 에이전트다 — 오타 하나가 조용한 성공이
// 되면 다음 단계가 "걸렸다"를 전제로 진행된다.
// spec: { 이름: 'string' | 'flag' } — 'string'은 값 필수(반복 허용), 'flag'는 값 없는 스위치.
function validateFlags(flags, spec) {
  const unknown = Object.keys(flags).filter(k => !(k in spec));
  if (unknown.length) {
    fail(`모르는 플래그: ${unknown.map(k => `--${k}`).join(', ')} — 쓸 수 있는 플래그: ${Object.keys(spec).map(k => `--${k}`).join(', ')}`);
  }
  for (const key of Object.keys(spec)) {
    if (spec[key] !== 'string' || flags[key] === undefined) continue;
    if ([].concat(flags[key]).some(v => typeof v !== 'string' || !String(v).trim())) {
      fail(`--${key} 에 값이 없다 — \`--${key} "<값>"\` 또는 \`--${key}=값\` 형태로 줘야 한다.`);
    }
  }
}

// 쉼표 목록 플래그("--depends a,b" → [a, b]) — validateFlags가 값 있음을 보증한다.
function csvList(v) {
  return stringArray(v).flatMap(s => String(s).split(',')).map(s => s.trim()).filter(Boolean);
}

// 로컬 타임존 ISO (분 단위) — 2026-08-29T23:14+09:00 형태. 클레임 만료 판정은
// Date.parse가 오프셋을 이해하므로 이 형태로 충분하다.
function localIso(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// 보드가 스캐폴드돼 있어야 한다 — 없으면 init으로 안내. 에러는 실제 탐색 루트와
// LLM_WIKI_ROOT 값을 함께 보고한다 — 오버라이드가 다른 곳을 보고 있었다는 단서.
function requireBoard() {
  const docRoot = findDocRoot();
  const paths = kanban.kanbanPaths(docRoot);
  if (!fs.existsSync(paths.kanbanDir)) {
    fail(`doc/kanban/ 이 없다 (${paths.kanbanDir}${process.env.LLM_WIKI_ROOT ? ` — LLM_WIKI_ROOT=${process.env.LLM_WIKI_ROOT}` : ''}). 먼저 \`llm-wiki init\`을 실행하라.`);
  }
  return { docRoot, paths, config: kanban.loadConfig(paths) };
}

function nowIso() { return localIso(); }

// ── depends_on 검증 (card new/edit 공용) ──────────────────────────────────
// 의존성은 보통 카드를 만들 때가 아니라 계획하다가 알게 된다 — card new 때만 걸 수
// 있으면 선행 카드가 늦게 생기는 정상 흐름을 기록할 길이 없다(2026-09-10 결함 B).
// 여기는 쓰는 규칙만 정한다 — pick이 읽는 규칙(resolved 판정)은 바꾸지 않는다.

// start에서 target까지 depends_on 간선을 따라 닿는 경로 — 순환 보고용. 없으면 null.
function depCyclePath(graph, start, target) {
  const seen = new Set();
  const walk = (node, trail) => {
    if (node === target) return trail;
    if (seen.has(node)) return null;
    seen.add(node);
    for (const next of graph.get(node) || []) {
      const found = walk(next, [...trail, next]);
      if (found) return found;
    }
    return null;
  };
  return walk(start, [start]);
}

// 새로 거는 의존성(deps)만 검증한다 — 이미 있던 것의 제거는 레거시의 끊어진 간선을
// 정리하는 길이어야 한다. 카드는 4폴더를 딱 한 번 로드한다(findCard 1회와 같은
// 비용) — 락 안에서 도니 반복 로드를 피한다.
function validateDepTargets(paths, title, deps) {
  if (deps.includes(title)) {
    fail(`자기 자신을 의존성으로 넣을 수 없다: ${title}`);
  }
  const all = kanban.listAllCards(paths);
  const known = new Set(all.map(c => c.meta.title));
  const missing = deps.filter(d => !known.has(d));
  if (missing.length) {
    fail(`의존성 카드가 없다: ${missing.join(', ')} — 끊어진 의존성은 pick을 영구히 막는다. card new로 먼저 만들어라.`);
  }
  // 순환은 활성(cards/) 카드의 간선으로만 판정한다 — 종결 카드를 의존성으로 넣는 것은
  // 허용되고(pick의 resolved 판정: done/superseded는 이미 해소), 종결 카드 자신의
  // depends_on은 아무도 기다리지 않는 죽은 이력이라 순환을 만들지 않는다.
  const graph = new Map(
    all
      .filter(c => kanban.ACTIVE_STATUSES.includes(c.meta.status))
      .map(c => [c.meta.title, Array.isArray(c.meta.depends_on) ? c.meta.depends_on : []])
  );
  for (const d of deps) {
    const cyc = depCyclePath(graph, d, title);
    if (cyc) fail(`순환 의존성이다: ${[title, ...cyc].join(' → ')} — 순환은 두 카드를 다 영구히 못 집게 만든다.`);
  }
}

// ── card new / show / edit ──────────────────────────────────────────────

const CARD_NEW_FLAGS = { goal: 'string', ac: 'string', depends: 'string', 'not-before': 'string' };
const CARD_EDIT_FLAGS = {
  goal: 'string', plan: 'string',
  ac: 'string', 'add-ac': 'string', 'check-ac': 'string',
  note: 'string', 'renew-claim': 'flag',
  depends: 'string', 'add-depends': 'string', 'remove-depends': 'string',
};

function cardNew(paths, config, { positional, flags }) {
  return kanban.withLock(paths, kanban.BOARD_LOCK_NAME, () => {
    const title = positional[0];
    if (!title) fail('사용법: llm-wiki card new "<제목>" [--goal …] [--ac …] [--depends a,b] [--not-before YYYY-MM-DD]');
    validateFlags(flags, CARD_NEW_FLAGS);

    const fileName = `${kanban.slugify(title)}.md`;
    const filePath = path.join(paths.cardsDir, fileName);
    if (fs.existsSync(filePath)) {
      fail(`같은 제목 카드가 이미 있다: ${filePath} — 제목이 곧 식별자다(3.5). 다른 제목을 쓰거나 supersede로 대체하라.`);
    }
    // cards/뿐 아니라 종결 3폴더까지 검사 — 예전엔 cards/만 보아 같은 제목 재생성을
    // 허용했고, 그 카드의 종결이 아카이브 원본을 덮어썼다(2026-09-09 리뷰 5-1-3).
    const existingAnywhere = kanban.findCard(paths, title);
    if (existingAnywhere) {
      fail(`같은 제목 카드가 이미 있다: ${existingAnywhere.filePath} — 제목이 곧 식별자다(3.5). 종결 기록과 충돌하므로 다른 제목을 쓰거나 기존 카드를 reopen/resume하라.`);
    }
    // 슬러그 충돌도 같은 파일명이 된다 — slugify가 '/', ':' 등을 같은 '-'로 접으므로
    // 'a/b'와 'a:b'는 같은 파일에 쓴다. 두 번째 생성이 첫 카드를 조용히 덮어쓰는
    // 일을 만들지 않는다(2026-09-09 리뷰 5-2).
    const slugClash = ['cardsDir', 'doneDir', 'supersededDir', 'abandonedDir']
      .map(k => paths[k])
      .filter(dir => fs.existsSync(dir))
      .some(dir => fs.readdirSync(dir).includes(fileName));
    if (slugClash) {
      fail(`같은 파일명(${fileName})이 이미 있다 — 제목이 달라도 슬러그가 같으면 한 파일을 공유해 덮어쓴다. 제목을 달리하라.`);
    }

    // ordinal: float, 스텝 1000, 컬럼(todo) 내 순서 (Backlog.md 방식).
    const ordinals = kanban.listCardsInDir(paths.cardsDir).map(c => Number(c.meta.ordinal) || 0);
    const ordinal = ordinals.length ? Math.max(...ordinals) + 1000 : 1000;

    const dependsOn = csvList(flags.depends);
    // 의존성 검증은 파일을 쓰기 전에 — 결함 B의 쓰기 규칙을 card new에도 같이
    // 적용한다(어디는 엄격하고 어디는 관대하면 규칙을 못 배운다).
    if (dependsOn.length) validateDepTargets(paths, title, dependsOn);
    const acTexts = stringArray(flags.ac);

    const meta = {
      title,
      status: 'todo',
      ordinal,
      created: localToday(),
    };
    if (dependsOn.length) meta.depends_on = dependsOn;
    // 시간 게이트 — 이 날짜 전에는 pick이 집지 않는다 (조건만족시 진행, plan.md 9번 원칙의 기계적 절반).
    if (typeof flags['not-before'] === 'string') meta.not_before = flags['not-before'];

    const parsed = {
      goal: flagString(flags.goal) || '',
      ac: acTexts.map((text, i) => ({ checked: false, idx: i + 1, text: String(text) })),
      sections: new Map([['Plan', ''], ['Notes', ''], ['Handoff', ''], ['Result', '']]),
    };

    fs.writeFileSync(filePath, kanban.serializeCard(meta, parsed));
    kanban.appendActivity(paths, { action: 'created', title });
    console.log(`Card created: ${filePath}`);
    console.log(`  ordinal: ${ordinal}${dependsOn.length ? `, depends_on: ${dependsOn.join(', ')}` : ''}`);
  });
}

function cardShow(paths, { positional }) {
  const title = positional[0];
  if (!title) fail('사용법: llm-wiki card show <제목>');
  const cardObj = kanban.findCard(paths, title);
  if (!cardObj) fail(`카드를 못 찾았다: ${title}`);
  console.log(fs.readFileSync(cardObj.filePath, 'utf8'));
}

function cardEdit(paths, { positional, flags }) {
  return kanban.withLock(paths, kanban.BOARD_LOCK_NAME, () => {
    const title = positional[0];
    if (!title) {
      fail('사용법: llm-wiki card edit <제목> [--goal …] [--plan …] [--ac …] [--add-ac …] [--check-ac 1,2] [--note …] [--renew-claim] [--depends a,b] [--add-depends a,b] [--remove-depends a,b]');
    }
    // 검증은 파일을 건드리기 전에 — 모르는 플래그(오타)·값 없는 플래그·바꿀 것 없는
    // 호출은 전부 조용한 no-op이 성공으로 보고되던 길이다(결함 A).
    validateFlags(flags, CARD_EDIT_FLAGS);
    if (!Object.keys(CARD_EDIT_FLAGS).some(k => flags[k] !== undefined)) {
      fail('바꿀 것이 지정되지 않았다 — 최소한 하나의 플래그가 필요하다.');
    }
    const cardObj = kanban.findCard(paths, title);
    if (!cardObj) fail(`카드를 못 찾았다: ${title}`);

    const meta = { ...cardObj.meta };
    const parsed = { goal: cardObj.card.goal, ac: cardObj.card.ac.map(a => ({ ...a })), sections: new Map(cardObj.card.sections) };
    const changes = [];

    if (typeof flags.goal === 'string') { parsed.goal = flags.goal; changes.push('goal'); }
    if (typeof flags.plan === 'string') { parsed.sections.set('Plan', flags.plan); changes.push('plan'); }

    // --ac는 목록 전체 교체, --add-ac는 뒤에 붙이기(번호는 최대+1 — 재정렬 후에도 #N 안정).
    const replaceAc = stringArray(flags.ac);
    if (replaceAc.length) {
      parsed.ac = replaceAc.map((text, i) => ({ checked: false, idx: i + 1, text: String(text) }));
      changes.push(`ac=${replaceAc.length}`);
    }
    const addAc = stringArray(flags['add-ac']);
    if (addAc.length) {
      let nextIdx = parsed.ac.reduce((m, a) => Math.max(m, a.idx), 0) + 1;
      for (const text of addAc) parsed.ac.push({ checked: false, idx: nextIdx++, text: String(text) });
      changes.push(`ac +${addAc.length}`);
    }

    // --check-ac 1,2 — AC는 객관적 증거로만 체크하라는 건 에이전트의 규율(루프 스킬)이고
    // CLI는 번호의 안전성(#N)만 보장한다.
    if (flags['check-ac'] !== undefined) {
      const idxs = asArray(flags['check-ac']).map(String).join(',').split(',').map(s => Number(s.trim()));
      for (const idx of idxs) {
        if (!Number.isInteger(idx) || idx < 1) fail(`--check-ac 는 AC 번호(쉼표 구분)를 받는다 — 받은 값: ${String(flags['check-ac'])}`);
        const ac = parsed.ac.find(a => a.idx === idx);
        if (!ac) fail(`AC #${idx} 가 없다 — 번호는 재정렬해도 유지된다.`);
        ac.checked = true;
      }
      changes.push(`check-ac #${idxs.join(', #')}`);
    }

    // Notes는 append-only 저널 — 타임스탬프와 함께 덧붙인다.
    const notes = stringArray(flags.note);
    if (notes.length) {
      const existing = parsed.sections.get('Notes') || '';
      const stamped = notes.map(n => `- ${nowIso()} — ${n}`).join('\n');
      parsed.sections.set('Notes', existing ? `${existing}\n${stamped}` : stamped);
      changes.push(`note +${notes.length}`);
    }

    // depends_on 편집 — --depends 전체 교체 → --add-depends 합집합 → --remove-depends
    // 차집합 순서(ac 계열 어법). 종결 카드의 의존성은 pick이 읽지 않는 이력이다.
    const replaceDeps = csvList(flags.depends);
    const addDeps = csvList(flags['add-depends']);
    const removeDeps = csvList(flags['remove-depends']);
    if (replaceDeps.length || addDeps.length || removeDeps.length) {
      if (!kanban.ACTIVE_STATUSES.includes(cardObj.meta.status)) {
        fail(`종결 카드(${cardObj.meta.status})의 의존성은 바꾸지 않는다 — pick이 이미 기다리지 않는 이력이다: ${cardObj.filePath}`);
      }
      const before = Array.isArray(meta.depends_on) ? [...new Set(meta.depends_on)] : [];
      let next = replaceDeps.length ? [...new Set(replaceDeps)] : [...before];
      for (const d of [...new Set(addDeps)]) {
        if (!next.includes(d)) next.push(d);
      }
      // 제거 대상이 목록에 없으면 오타일 확률이 높다 — 조용히 성공하면 "걸었다"고
      // 믿은 채 진행된다(check-ac가 없는 번호를 거부하는 것과 같은 규칙).
      const absent = removeDeps.filter(d => !next.includes(d));
      if (absent.length) {
        fail(`제거할 의존성이 이 카드에 없다: ${absent.join(', ')} — 현재 depends_on: [${next.join(', ') || '없음'}]`);
      }
      next = next.filter(d => !removeDeps.includes(d));
      // 검증은 새로 들어온 간선에만 — 이미 있던 의존성의 제거(레거시 정리)는
      // 대상 카드가 살아있어야 하는 게 아니다.
      const introduced = next.filter(d => !before.includes(d));
      validateDepTargets(paths, title, introduced);
      const removed = before.filter(d => !next.includes(d));
      if (introduced.length) changes.push(`depends +${introduced.join(', ')}`);
      if (removed.length) changes.push(`depends -${removed.join(', ')}`);
      if (next.length) meta.depends_on = next;
      else delete meta.depends_on;
    }

    // --renew-claim — 긴 카드는 타임아웃 전에 클레임을 갱신한다 (루프 스킬 규칙 6).
    // 클레임은 만료 있는 협동 락이므로, 살아있는 작업자는 주기적으로 시각을 다시 심는다.
    // 락 안에서 만료를 재검증한다 — 만료된 클레임의 갱신은 다른 세션이 이미 재집어
    // 작업 중인 카드의 시각을 되살려 이중 작업을 만든다. 갱신 거부 → 재집기(pick) 유도.
    if (flags['renew-claim']) {
      if (!meta.claimed_by) fail(`클레임이 없는 카드다: ${title} — renew가 아니라 pick으로 집어라.`);
      const config = kanban.loadConfig(paths);
      if (kanban.isClaimExpired({ meta }, config)) {
        fail(`클레임이 만료됐다 (${meta.claimed_at}) — 다른 세션이 재집었을 수 있다. pick으로 다시 집어라.`);
      }
      meta.claimed_at = nowIso();
      changes.push('renew-claim');
    }

    // 성공 문구는 실제로 무엇이 바뀌었는지 말한다. 플래그는 있었지만 결과가 동일하면
    // (멱등 재시도) 성공을 주장하지 않고 파일도 다시 쓰지 않는다.
    if (!changes.length) {
      console.log(`변경 없음 — 이미 그 상태다: ${cardObj.filePath}`);
      return;
    }
    kanban.writeCard(cardObj, meta, parsed);
    console.log(`Card edited: ${cardObj.filePath} (${changes.join(', ')})`);
  });
}

// QA 루프의 되돌림 원시형 (개선계획 4-3) — 증거 빈약한 완료를 doing으로 역류시킨다.
// 카드 수가 일시적으로 늘어나는 것이 곡선의 진짜를 만든다 (plan.md 2.4).
function reopen(options = {}) {
  const { paths } = requireBoard();
  const { positional, flags } = parseArgs(options.rest || []);
  const title = positional[0];
  const why = flagString(flags.why) || flagString(flags.reason);
  if (!title || !why) fail('사용법: llm-wiki reopen <제목> --why "…" — 되돌림 사유가 기록되지 않으면 QA가 아니다.');

  return kanban.withLock(paths, kanban.BOARD_LOCK_NAME, () => {
    const cardObj = kanban.findCard(paths, title);
    if (!cardObj) fail(`카드를 못 찾았다: ${title}`);
    if (cardObj.meta.status !== 'done') fail(`done 카드만 되돌린다 (현재: ${cardObj.meta.status}): ${cardObj.filePath}`);

    const content = fs.readFileSync(cardObj.filePath, 'utf8');
    const meta = kanban.parseFrontmatter(content);
    const parsed = kanban.parseBody(content);
    meta.status = 'doing';
    delete meta.claimed_by;
    delete meta.claimed_at;
    const notes = parsed.sections.get('Notes') || '';
    const line = `- ${nowIso()} — REVERTED: ${why}`;
    parsed.sections.set('Notes', notes ? `${notes}\n${line}` : line);

    fs.writeFileSync(path.join(paths.cardsDir, cardObj.fileName), kanban.serializeCard(meta, parsed));
    fs.unlinkSync(cardObj.filePath);
    kanban.appendActivity(paths, { action: 'reverted', title: meta.title, detail: String(why) });
    console.log(`Reverted to doing: ${path.join(paths.cardsDir, cardObj.fileName)}`);
  });
}

// ── pick — 원자적 집기 ───────────────────────────────────────────────────

// 준비 필터(미클레임/만료/의존 충족/WIP 여유) → ordinal 정렬 → 클레임 → doing.
// 전 과정을 락 안에서 — 동시 pick 빈틈을 처음부터 막고 출발한다 (kanban-md 교훈).
function pick(options = {}) {
  const { paths, config } = requireBoard();
  const { flags } = parseArgs(options.rest || []);
  const claimName = typeof flags.claim === 'string' && flags.claim ? flags.claim : 'unnamed-agent';

  const result = kanban.withLock(paths, kanban.BOARD_LOCK_NAME, () => {
    // cards/의 모든 .md가 카드는 아니다(README 등) — 활성 status가 없는 파일은
    // 후보에서 제외한다. 예전엔 이를 집어 재직렬화하며 `## ` 앞 본문을 지웠다(5-1-4).
    const active = kanban.listCardsInDir(paths.cardsDir)
      .filter(c => kanban.ACTIVE_STATUSES.includes(c.meta.status));
    const doing = active.filter(c => c.meta.status === 'doing');
    const wipLimit = config.wipLimits.doing !== undefined ? config.wipLimits.doing : Infinity;

    if (doing.length >= wipLimit) {
      return { picked: null, reason: `wip-limit`, detail: `doing WIP 상한 도달 (${doing.length}/${wipLimit}) — 하던 카드를 먼저 종결하라.` };
    }

    // 종결 = done 또는 superseded 폴더에 존재. abandoned 의존은 미충족(길이 틀렸다는 신호).
    const resolvedTitles = new Set([
      ...kanban.listCardsInDir(paths.doneDir).map(c => c.meta.title),
      ...kanban.listCardsInDir(paths.supersededDir).map(c => c.meta.title),
    ]);

    const blocked = [];
    const candidates = [];
    const today = localToday(); // not_before 게이트 — 현지 날짜(5-1-5)
    for (const cardObj of active) {
      const status = cardObj.meta.status;
      // review는 사람 판정 대기 — pick이 집지 않는다.
      if (status === 'review') continue;

      // 시간 게이트 — not_before가 미래면 아직 시작하지 않는 카드다.
      if (cardObj.meta.not_before && String(cardObj.meta.not_before) > today) {
        blocked.push({ title: cardObj.meta.title, notBefore: cardObj.meta.not_before });
        continue;
      }

      // 클레임이 살아있는 doing은 남의 작업. 만료됐으면 재집기 후보 — 밤에 죽은
      // 세션의 카드를 자동 회수하는 것이 협동 락의 존재 이유다.
      if (cardObj.meta.claimed_by && !kanban.isClaimExpired(cardObj, config)) {
        blocked.push({ title: cardObj.meta.title, claimedBy: cardObj.meta.claimed_by });
        continue;
      }

      if (status === 'todo') {
        const deps = Array.isArray(cardObj.meta.depends_on) ? cardObj.meta.depends_on : [];
        const unmet = deps.filter(dep => !resolvedTitles.has(dep));
        if (unmet.length) { blocked.push({ title: cardObj.meta.title, unmet }); continue; }
      }
      candidates.push(cardObj);
    }

    candidates.sort((a, b) => (Number(a.meta.ordinal) || 0) - (Number(b.meta.ordinal) || 0));
    const chosen = candidates[0];
    if (!chosen) {
      return { picked: null, reason: blocked.length ? 'blocked-or-claimed' : 'empty', detail: blocked };
    }

    const meta = { ...chosen.meta };
    meta.status = 'doing';
    meta.claimed_by = claimName;
    meta.claimed_at = nowIso();
    kanban.writeCard(chosen, meta);
    kanban.appendActivity(paths, { action: 'claimed', title: meta.title, actor: claimName });
    return { picked: { path: chosen.filePath, title: meta.title }, reason: null };
  });

  if (options.json) {
    console.log(JSON.stringify({ schemaVersion: 1, kind: 'kanban-pick', ...result }, null, 2));
    return;
  }
  if (!result.picked) {
    console.log(`No pickable card (${result.reason}).`);
    if (Array.isArray(result.detail)) {
    for (const b of result.detail) {
      if (b.notBefore) console.log(`  - ${b.title} — 시작 예정: ${b.notBefore} 이후 (not_before)`);
      else if (b.unmet && b.unmet.length) console.log(`  - ${b.title} — 의존 미충족: ${b.unmet.join(', ')}`);
      else if (b.claimedBy) console.log(`  - ${b.title} — 클레임 중: ${b.claimedBy}`);
    }
    } else if (result.detail) {
      console.log(`  ${result.detail}`);
    }
    return;
  }
  console.log(`PICKED: ${result.picked.path}`);
  console.log(fs.readFileSync(result.picked.path, 'utf8'));
}

// ── 종결 3갈래 + handoff ────────────────────────────────────────────────

// 활성 카드만 상태 전이 대상. 종결 카드는 이미 끝난 이력이다.
function requireActiveCard(paths, title) {
  const cardObj = kanban.findCard(paths, title);
  if (!cardObj) fail(`카드를 못 찾았다: ${title}`);
  if (!kanban.ACTIVE_STATUSES.includes(cardObj.meta.status)) {
    fail(`카드는 이미 종결됐다 (${cardObj.meta.status}): ${cardObj.filePath}`);
  }
  return cardObj;
}

function handoff(options = {}) {
  const { paths } = requireBoard();
  const { positional, flags } = parseArgs(options.rest || []);
  const title = positional[0];
  const question = flagString(flags.question);
  if (!title || !question) fail('사용법: llm-wiki handoff <제목> --question "…"');

  return kanban.withLock(paths, kanban.BOARD_LOCK_NAME, () => {
    const cardObj = requireActiveCard(paths, title);
    const meta = { ...cardObj.meta };
    const parsed = { ...cardObj.card, ac: cardObj.card.ac.map(a => ({ ...a })), sections: new Map(cardObj.card.sections) };

    meta.status = 'review';
    delete meta.claimed_by;   // 클레임 반납 — park하고 다음 카드로
    delete meta.claimed_at;

    const existing = parsed.sections.get('Handoff') || '';
    const line = `- ${nowIso()} — QUESTION: ${question}`;
    parsed.sections.set('Handoff', existing ? `${existing}\n${line}` : line);

    kanban.writeCard(cardObj, meta, parsed);
    kanban.appendActivity(paths, { action: 'handoff', title: meta.title, detail: String(question) });
    console.log(`Handed off (parked for human judgment): ${cardObj.filePath}`);
  });
}

function doneCard(options = {}) {
  const { paths } = requireBoard();
  const { positional, flags } = parseArgs(options.rest || []);
  const title = positional[0];
  const result = flagString(flags.result);
  if (!title || !result) fail('사용법: llm-wiki done <제목> --result "…" — Result 없는 완료는 거부한다.');

  return kanban.withLock(paths, kanban.BOARD_LOCK_NAME, () => {
    const cardObj = requireActiveCard(paths, title);
    const meta = { ...cardObj.meta };
    const parsed = { ...cardObj.card, ac: cardObj.card.ac.map(a => ({ ...a })), sections: new Map(cardObj.card.sections) };

    const unchecked = parsed.ac.filter(a => !a.checked);
    if (unchecked.length) {
      console.error(`⚠ AC ${unchecked.map(a => `#${a.idx}`).join(', ')} 가 체크 안 됐다 — 증거로 체크했는지 스스로 검증하라 (QA 루프가 되돌릴 수 있다).`);
    }

    const existing = parsed.sections.get('Result') || '';
    const line = `- ${nowIso()} — ${result}`;
    parsed.sections.set('Result', existing ? `${existing}\n${line}` : line);

    delete meta.claimed_by;
    delete meta.claimed_at;
    kanban.writeCard(cardObj, meta, parsed);
    try {
      kanban.moveCardTo(cardObj, paths.doneDir, 'done');
    } catch (e) {
      fail(e.message); // 카드는 활성으로 남는다 — Result는 이미 반영돼 있다.
    }
    kanban.appendActivity(paths, { action: 'done', title: meta.title });
    console.log(`Done: ${path.join(paths.doneDir, cardObj.fileName)}`);
  });
}

// 대체 — 이 카드가 저 카드들이 됨. 부모는 완료가 아니라 소멸(3.1).
function supersede(options = {}) {
  const { paths } = requireBoard();
  const { positional, flags } = parseArgs(options.rest || []);
  const title = positional[0];
  const by = stringArray(flags.by).flatMap(s => s.split(',')).map(s => s.trim()).filter(Boolean);
  if (!title || !by.length) fail('사용법: llm-wiki supersede <제목> --by 자식1,자식2');

  return kanban.withLock(paths, kanban.BOARD_LOCK_NAME, () => {
    const parent = requireActiveCard(paths, title);
    for (const child of by) {
      const childCard = kanban.findCard(paths, child);
      if (!childCard) fail(`자식 카드를 먼저 만들어라 (card new): ${child}`);
      if (!kanban.ACTIVE_STATUSES.includes(childCard.meta.status)) {
        fail(`자식 카드가 이미 종결됐다 (${childCard.meta.status}): ${child}`);
      }
    }

    const meta = { ...parent.meta, superseded_by: by };
    kanban.writeCard(parent, meta);
    try {
      kanban.moveCardTo(parent, paths.supersededDir, 'superseded');
    } catch (e) {
      fail(e.message);
    }
    kanban.appendActivity(paths, { action: 'superseded', title: parent.meta.title, detail: `by ${by.join(', ')}` });
    console.log(`Superseded: ${parent.meta.title} → [${by.join(', ')}]`);
    console.log(`  parent: ${path.join(paths.supersededDir, parent.fileName)}`);
  });
}

// 폐기 — 사유가 가장 값비싼 정보다(3.3). 없으면 거부하고, 기록은 지우지 않는다.
function abandon(options = {}) {
  const { docRoot, paths } = requireBoard();
  const { positional, flags } = parseArgs(options.rest || []);
  const title = positional[0];
  const reason = flagString(flags.reason);
  if (!title || !reason) fail('사용법: llm-wiki abandon <제목> --reason "…" — 폐기 사유가 안티패턴의 원재료다.');

  return kanban.withLock(paths, kanban.BOARD_LOCK_NAME, () => {
    const cardObj = requireActiveCard(paths, title);
    const meta = { ...cardObj.meta, discard_reason: String(reason) };
    kanban.writeCard(cardObj, meta);
    try {
      kanban.moveCardTo(cardObj, paths.abandonedDir, 'abandoned');
    } catch (e) {
      fail(e.message);
    }
    kanban.appendActivity(paths, { action: 'abandoned', title: cardObj.meta.title, detail: String(reason) });

    // 4-2: 폐기 사유를 raw에 자동 기록 (기본 on — --no-raw-log로 끈다).
    if (!flags['no-raw-log']) {
      try {
        const rawPath = appendAbandonRaw(docRoot, cardObj.meta.title, String(reason), path.relative(process.cwd(), path.join(paths.abandonedDir, cardObj.fileName)));
        if (rawPath) console.log(`폐기 사유를 raw에 기록했다 (안티패턴 원재료): ${rawPath}`);
      } catch (e) {
        console.error(`⚠ raw 기록 실패 (폐기 자체는 완료): ${e.message}`);
      }
    }

    console.log(`Abandoned: ${path.join(paths.abandonedDir, cardObj.fileName)}`);
  });
}

// ── board — 유도 뷰 ──────────────────────────────────────────────────────

// 카드가 정본이고 이 출력은 유도물이다 (3.7 원칙 2 — 갱신을 강제하지 않는다).
function collectBoard() {
  const { paths, config } = requireBoard();
  const active = kanban.listCardsInDir(paths.cardsDir);
  const byStatus = status => active
    .filter(c => c.meta.status === status)
    .sort((a, b) => (Number(a.meta.ordinal) || 0) - (Number(b.meta.ordinal) || 0));

  const view = {
    schemaVersion: 1,
    kind: 'kanban-board',
    generatedAt: new Date().toISOString(),
    wip: { doing: { used: byStatus('doing').length, limit: config.wipLimits.doing } },
    columns: {
      todo: byStatus('todo').map(c => viewCard(c, config)),
      doing: byStatus('doing').map(c => viewCard(c, config)),
      review: byStatus('review').map(c => viewCard(c, config)),
    },
    terminal: {
      done: kanban.listCardsInDir(paths.doneDir).length,
      superseded: kanban.listCardsInDir(paths.supersededDir).length,
      abandoned: kanban.listCardsInDir(paths.abandonedDir).length,
    },
    // 종결 적체 — 완료가 쌓이는 모습이 수렴의 증거다 (HTML 보드용 최근 목록).
    terminalRecent: [
      ...kanban.listCardsInDir(paths.doneDir).map(c => ({ title: c.meta.title, kind: 'done', m: fs.statSync(c.filePath).mtimeMs })),
      ...kanban.listCardsInDir(paths.supersededDir).map(c => ({ title: c.meta.title, kind: 'superseded', m: fs.statSync(c.filePath).mtimeMs })),
      ...kanban.listCardsInDir(paths.abandonedDir).map(c => ({ title: c.meta.title, kind: 'abandoned', m: fs.statSync(c.filePath).mtimeMs })),
    ]
      .sort((a, b) => b.m - a.m)
      .slice(0, 8)
      .map(({ title, kind }) => ({ title, kind })),
    // 의존 충족 판정용 종결 제목들 — 텍스트/HTML 렌더러가 공유한다.
    resolved: [...kanban.listCardsInDir(paths.doneDir), ...kanban.listCardsInDir(paths.supersededDir)]
      .map(c => c.meta.title),
  };
  return { view, paths, config };
}

function boardView(options = {}) {
  const { view, paths, config } = collectBoard();

  if (options.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  if (options.html) {
    const htmlPath = path.join(paths.kanbanDir, 'board.html');
    fs.writeFileSync(htmlPath, renderBoardHtml(view));
    console.log(`Board written: ${htmlPath}`);
    console.log('  유도물 — 서버 없이 브라우저에서 열면 된다. 갱신은 다시 `llm-wiki board --html`.');
    return;
  }
  renderBoard(view, config);
}

function viewCard(cardObj, config) {
  const expired = cardObj.meta.status === 'doing' && kanban.isClaimExpired(cardObj, config);
  // 대기 사유 — handoff가 남긴 마지막 QUESTION을 끌어낸다. 대기 큐가 제목만
  // 나열하면 아침의 사람이 카드를 하나씩 열어야 하므로(3단계 완료 기준 ②).
  const handoff = cardObj.card.sections.get('Handoff') || '';
  const qLine = [...handoff.split(/\r?\n/)].reverse().find(l => l.includes('QUESTION:'));
  return {
    title: cardObj.meta.title,
    ordinal: Number(cardObj.meta.ordinal) || 0,
    claimedBy: cardObj.meta.claimed_by || null,
    claimExpired: expired,
    notBefore: cardObj.meta.not_before || null,
    question: qLine ? qLine.split('QUESTION:')[1].trim() : null,
    dependsOn: cardObj.meta.depends_on || [],
  };
}

function renderBoard(view, config) {
  const line = '────────────────────────────────────────';
  console.log(`Kanban board (${localToday()}) — 정본은 doc/kanban/ 카드 파일들`);
  console.log(line);

  const wip = view.wip.doing;
  console.log(`DOING (${wip.used}/${wip.limit}${wip.used >= wip.limit ? ' — WIP 상한' : ''})`);
  if (!view.columns.doing.length) console.log('  (비어 있음)');
  for (const c of view.columns.doing) {
    console.log(`  • ${c.title}${c.claimExpired ? '  [클레임 만료 — 재집기 가능]' : `  [${c.claimedBy}]`}`);
  }

  console.log(line);
  console.log(`REVIEW (사람 판정 대기 — ${view.columns.review.length})`);
  if (!view.columns.review.length) console.log('  (비어 있음)');
  for (const c of view.columns.review) {
    console.log(`  • ${c.title}`);
    if (c.question) console.log(`      ↳ ${c.question}`);
  }

  console.log(line);
  console.log(`TODO (${view.columns.todo.length}) — ordinal 순`);
  const resolved = new Set(view.resolved);
  if (!view.columns.todo.length) console.log('  (비어 있음)');
  for (const c of view.columns.todo) {
    const unmet = c.dependsOn.filter(dep => !resolved.has(dep));
    const gate = c.notBefore && c.notBefore > localToday();
    console.log(`  • ${c.title}${gate ? `  [시작 예정 — ${c.notBefore}]` : ''}${unmet.length ? `  [대기 — 의존: ${unmet.join(', ')}]` : ''}`);
  }

  console.log(line);
  console.log(`종결: done ${view.terminal.done} · superseded ${view.terminal.superseded} · abandoned ${view.terminal.abandoned}`);
}

// ── 정적 HTML 보드 — 사람용 시각화 (유도 뷰) ─────────────────────────────
// 서버 없음, file://로 열린다. 드래그 이동이 있는 웹 뷰는 포맷이 굳은 뒤의
// 확정 대상(plan.md) — 그때까지는 읽기 전용이 원칙이다.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderBoardHtml(view) {
  const today = localToday();
  const resolved = new Set(view.resolved);

  const badges = c => {
    const out = [];
    if (c.claimExpired) out.push('<span class="badge warn">클레임 만료</span>');
    else if (c.claimedBy) out.push(`<span class="badge">${escapeHtml(c.claimedBy)}</span>`);
    if (c.notBefore && c.notBefore > today) out.push(`<span class="badge gate">시작 예정 ${escapeHtml(c.notBefore)}</span>`);
    const unmet = c.dependsOn.filter(dep => !resolved.has(dep));
    if (unmet.length) out.push(`<span class="badge gate">의존 대기: ${unmet.map(escapeHtml).join(', ')}</span>`);
    return out.join(' ');
  };
  const cardDiv = c => `<div class="card"><div class="t">${escapeHtml(c.title)}</div>${c.question ? `<div class="q">↳ ${escapeHtml(c.question)}</div>` : ''}${badges(c)}</div>`;
  const kindLabel = { done: '완료', superseded: '대체', abandoned: '폐기' };
  const terminalList = view.terminalRecent.length
    ? view.terminalRecent
        .map(t => `<div class="card"><span class="badge t-${t.kind}">${kindLabel[t.kind]}</span><span class="tt">${escapeHtml(t.title)}</span></div>`)
        .join('\n')
    : '<div class="empty">비어 있음</div>';
  const column = (label, cards) => `
    <section>
      <h2>${label} <span class="count">${cards.length}</span></h2>
      ${cards.map(cardDiv).join('\n') || '<div class="empty">비어 있음</div>'}
    </section>`;
  const terminalSection = `
    <section>
      <h2>종결 적체 <span class="count">최근 ${view.terminalRecent.length}</span></h2>
      ${terminalList}
    </section>`;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>llm-wiki board</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif; margin: 24px; background: #f6f7f9; color: #1c2733; }
  header h1 { font-size: 20px; margin: 0 0 4px; }
  header p { margin: 0 0 20px; color: #5b6a78; font-size: 13px; }
  main { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  section { background: #fff; border: 1px solid #e2e6ea; border-radius: 10px; padding: 12px; }
  h2 { font-size: 14px; margin: 0 0 10px; text-transform: uppercase; letter-spacing: .04em; color: #40505f; }
  .count { color: #8a97a3; font-weight: 400; }
  .card { background: #f2f4f7; border: 1px solid #dde2e8; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
  .card .t { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
  .q { font-size: 12px; color: #5b6a78; margin: 2px 0 4px; }
  .badge { display: inline-block; font-size: 11px; background: #e3e8ee; color: #44525f; border-radius: 999px; padding: 2px 8px; margin: 2px 4px 0 0; }
  .badge.warn { background: #fdeccf; color: #7a4d05; }
  .badge.gate { background: #dbe7fd; color: #1c4d8f; }
  .empty { color: #98a3ad; font-size: 13px; }
  .tt { font-size: 13px; color: #1c2733; }
  .t-done { background: #6ee7a0; }
  .t-superseded { background: #c9a6ff; }
  .t-abandoned { background: #ff8f8f; }
  footer { margin-top: 18px; color: #5b6a78; font-size: 13px; }
</style>
</head>
<body>
<header>
  <h1>Kanban board</h1>
  <p>생성: ${escapeHtml(view.generatedAt)} · WIP doing ${view.wip.doing.used}/${view.wip.doing.limit} · 이 파일은 유도물 — 정본은 doc/kanban/ 카드 파일들</p>
</header>
<main style="grid-template-columns: repeat(4, 1fr)">
${column('Doing', view.columns.doing)}
${column('Review (사람 판정 대기)', view.columns.review)}
${column('Todo', view.columns.todo)}
${terminalSection}
</main>
<footer>종결: done ${view.terminal.done} · superseded ${view.terminal.superseded} · abandoned ${view.terminal.abandoned} — 갱신은 <code>llm-wiki board --html</code></footer>
</body>
</html>
`;
}

// review(대기) → todo 복귀 — 조건이 충족됐거나 사람이 판정을 내렸을 때.
// 조건부 카드(Activation/not_before)의 진행 스위치다. 대기에서 저절로 풀리는 건
// not_before(기계 판정)뿐이고, 관측형 조건은 이 명령으로 명시적으로 푼다.
function resume(options = {}) {
  const { paths } = requireBoard();
  const { positional, flags } = parseArgs(options.rest || []);
  const title = positional[0];
  if (!title) fail('사용법: llm-wiki resume <제목> [--note "…"]');

  return kanban.withLock(paths, kanban.BOARD_LOCK_NAME, () => {
    const cardObj = kanban.findCard(paths, title);
    if (!cardObj) fail(`카드를 못 찾았다: ${title}`);
    if (cardObj.meta.status !== 'review') fail(`review 카드만 복귀시킨다 (현재: ${cardObj.meta.status}): ${cardObj.filePath}`);

    const meta = { ...cardObj.meta, status: 'todo' };
    const parsed = { ...cardObj.card, ac: cardObj.card.ac.map(a => ({ ...a })), sections: new Map(cardObj.card.sections) };
    const line = `- ${nowIso()} — RESUMED: ${typeof flags.note === 'string' && flags.note ? flags.note : '대기 조건 충족 또는 사람 판정'}`;
    const notes = parsed.sections.get('Notes') || '';
    parsed.sections.set('Notes', notes ? `${notes}\n${line}` : line);

    kanban.writeCard(cardObj, meta, parsed);
    kanban.appendActivity(paths, { action: 'resumed', title: meta.title, detail: typeof flags.note === 'string' ? flags.note : undefined });
    console.log(`Resumed to todo: ${cardObj.filePath}`);
  });
}

// ── board report — 계기판 (개선계획 4-1) ─────────────────────────────────

// 계기판은 카드 수가 아니라 완료:폐기 비율이다 (plan.md 3.2 확정 — 폐기도 곡선을
// 떨어뜨린다. 30장이 1장이 됐을 때 다 끝나서인지 다 갖다버려서인지 카드 수만으로는
// 모른다). 아침의 사람이 보는 한 화면.
function boardReport(options = {}) {
  const { docRoot, paths, config } = requireBoard();

  const done = kanban.listCardsInDir(paths.doneDir);
  const superseded = kanban.listCardsInDir(paths.supersededDir);
  const abandoned = kanban.listCardsInDir(paths.abandonedDir);
  const active = kanban.listCardsInDir(paths.cardsDir);
  const activity = kanban.readActivity(paths);

  const resolved = done.length + abandoned.length;
  const doneShare = resolved > 0 ? Math.round((done.length / resolved) * 100) : null;

  const expired = active.filter(c => c.meta.status === 'doing' && kanban.isClaimExpired(c, config));
  const review = active.filter(c => c.meta.status === 'review');
  const reverted = activity.filter(a => a.action === 'reverted');

  // 카드 수 추이 — activity.jsonl 기반 일별 집계 (최근 14일).
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(localToday(d));
  }
  const trend = days.map(day => {
    const on = action => activity.filter(a => a.action === action && String(a.ts).startsWith(day)).length;
    const created = on('created');
    const closed = on('done') + on('superseded') + on('abandoned');
    return { day, created, done: on('done'), superseded: on('superseded'), abandoned: on('abandoned'), reverted: on('reverted'), closed };
  }).filter(t => t.created || t.closed || t.reverted);

  const report = {
    schemaVersion: 1,
    kind: 'kanban-board-report',
    generatedAt: new Date().toISOString(),
    convergence: { done: done.length, abandoned: abandoned.length, superseded: superseded.length, doneSharePercent: doneShare },
    active: { todo: active.filter(c => c.meta.status === 'todo').length, doing: active.filter(c => c.meta.status === 'doing').length, review: review.length },
    waitingQueue: review.map(c => viewCard(c, config)).map(c => ({ title: c.title, question: c.question })),
    expiredClaims: expired.map(c => c.meta.title),
    revertCount: reverted.length,
    recentReverts: reverted.slice(-5),
    trend,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const line = '────────────────────────────────────────';
  console.log(`📊 Board report (${report.generatedAt.split('T')[0]})`);
  console.log(line);

  if (doneShare === null) {
    console.log('완료:폐기 비율 — 아직 종결된 카드가 없다.');
  } else {
    const alarm = doneShare < 50 ? '  ⚠ 폐기가 완료보다 많다 — 같은 벽에 반복 부딪히는 중인지 raw/안티패턴을 확인하라.' : '';
    console.log(`완료:폐기 비율 — done ${done.length} : abandoned ${abandoned.length} (superseded ${superseded.length}) → 완료 점유율 ${doneShare}%${alarm}`);
  }

  console.log(`활성: todo ${report.active.todo} · doing ${report.active.doing} (WIP ${config.wipLimits.doing}) · review ${report.active.review}`);
  console.log(`되돌림(QA): ${report.revertCount}건 — 가짜 완료를 잡아낸 신호다.`);

  if (report.expiredClaims.length) {
    console.log(`만료 클레임 (${report.expiredClaims.length}) — 재집기 가능:`);
    report.expiredClaims.forEach(t => console.log(`  • ${t}`));
  }

  console.log(line);
  console.log(`대기 큐 (사람 판정 대기 — ${report.waitingQueue.length})`);
  if (!report.waitingQueue.length) console.log('  (비어 있음 — 밤샘 동안 판단 질문이 없었다는 뜻)');
  for (const w of report.waitingQueue) {
    console.log(`  • ${w.title}`);
    if (w.question) console.log(`      ↳ ${w.question}`);
  }

  if (trend.length) {
    console.log(line);
    console.log('카드 수 추이 (activity.jsonl 기반, 변화 있던 날만):');
    for (const t of trend) {
      console.log(`  ${t.day}  created ${t.created} · done ${t.done} · superseded ${t.superseded} · abandoned ${t.abandoned} · reverted ${t.reverted}`);
    }
  }
}

// ── 폐기→안티패턴 파이프라인 (개선계획 4-2) ──────────────────────────────

// 폐기 사유를 raw 로그에 discovery 케이스로 기록한다 — 주기 compile이 이걸
// antipatterns/ 승격 후보로 삼는다. "폐기 사유가 지워지지 않고 위키로 흐르는 것"이
// plan.md 3.3의 실행이다. 사유는 이 시스템에서 가장 값비싼 정보다.
function appendAbandonRaw(docRoot, title, reason, cardPath) {
  const rawDir = path.join(docRoot, 'raw');
  if (!fs.existsSync(rawDir)) return null;

  const today = localToday(); // raw 로그 파일명은 현지 날짜(header-date-over-mtime)
  const rawPath = path.join(rawDir, `${today}.md`);
  let caseNum = 1;
  let header = `# ${today}\n`;
  if (fs.existsSync(rawPath)) {
    const content = fs.readFileSync(rawPath, 'utf8');
    header = '';
    caseNum = (content.match(/^## Case \d+:/gm) || []).length + 1;
  }
  const entry = [
    '',
    `## Case ${caseNum}: [폐기] ${title}`,
    '',
    '### Grounding',
    `- Evidence: ${cardPath}`,
    '- Confidence: 4/5',
    '',
    '### Discovery',
    '이 길은 아니었다 — 카드가 폐기됐다. 폐기 사유(안티패턴 원재료):',
    '',
    String(reason),
    '',
    '### Analysis',
    '- Why non-obvious: 다음 세션이 같은 벽에 다시 부딪히지 않게 하는 기록이다.',
    '- Action taken: 주기 compile에서 안티패턴 승격 후보로 검토할 것.',
    '',
    '### Related Knowledge',
    `- **Anti-Patterns**: [[${kanban.slugify(title)}]]`,
    '',
  ].join('\n');

  if (header) fs.writeFileSync(rawPath, header);
  fs.appendFileSync(rawPath, entry);
  return rawPath;
}

// ── board video — 활동 로그 재생 타임랩스 (work-loop 종료 산출물) ─────────
// activity.jsonl의 모든 이벤트는 타임스탬프가 있으므로 보드의 변화를 재현할 수
// 있다. 타임라인 JSON을 남기고, video/의 Remotion 프로젝트가 있으면 함께 렌더한다.
// 렌더는 headless Chrome 기반 CPU 작업이다 (GPU 불필요).
function boardVideo(options = {}) {
  const { paths, config } = requireBoard();
  const activity = kanban.readActivity(paths);
  const cfg = loadConfig(findDocRoot());
  const repo = cfg.projectName || path.basename(process.cwd());

  const timeline = {
    schemaVersion: 1,
    kind: 'board-timeline',
    repo,
    wip: config.wipLimits.doing !== undefined ? config.wipLimits.doing : null,
    generatedAt: new Date().toISOString(),
    events: activity.map(a => ({ ts: a.ts, action: a.action, title: a.title, actor: a.actor, detail: a.detail })),
  };
  const timelinePath = path.join(paths.kanbanDir, 'board-timeline.json');
  fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2) + '\n');
  console.log(`Timeline written: ${timelinePath} (${timeline.events.length} events)`);

  const videoProject = path.join(process.cwd(), 'video');
  if (!fs.existsSync(path.join(videoProject, 'package.json'))) {
    console.log('video/ Remotion 프로젝트가 없다 — 타임라인(board-timeline.json)만 남긴다.');
    console.log('  렌더 프로젝트는 npm 패키지에 포함되지 않는다(llm-wiki 레포의 video/ 참고).');
    return;
  }

  console.log('Rendering board timelapse (headless Chrome — 첫 실행은 Chrome 내려받기로 몇 분 걸린다)...');
  // kanbanDir 기준 절대경로로 렌더 — ../doc/ 하드코딩은 LLM_WIKI_ROOT 오버라이드와
  // 다른 doc 루트에서 엉뚱한 곳을 읽게 한다(2026-09-09 리뷰 5-2). 따옴표로 감싸
  // 경로의 공백도 안전하게.
  const mp4Path = path.join(paths.kanbanDir, 'board-timelapse.mp4');
  execSync(
    `npx remotion render src/index.ts BoardTimelapse "${mp4Path}" --props="${timelinePath}"`,
    { cwd: videoProject, stdio: 'inherit', timeout: 570000 }
  );
  console.log(`Video written: ${mp4Path}`);
}

// ── 디스패치 ─────────────────────────────────────────────────────────────

function dispatchCard(rest) {
  const { paths } = requireBoard();
  const parsedArgs = parseArgs(rest);
  const sub = parsedArgs.positional.shift();
  if (sub === 'new') cardNew(paths, kanban.loadConfig(paths), parsedArgs);
  else if (sub === 'show') cardShow(paths, parsedArgs);
  else if (sub === 'edit') cardEdit(paths, parsedArgs);
  else fail('사용법: llm-wiki card <new|show|edit> …');
}

module.exports = {
  // wait(kanban-wait)가 같은 플래그 규칙으로 재사용한다 — 계층 간 단일 파서.
  parseArgs,
  validateFlags,
  fail,
  dispatchCard,
  pick,
  handoff,
  doneCard,
  supersede,
  abandon,
  reopen,
  resume,
  boardView,
  boardReport,
  boardVideo,
  scaffold: kanban.scaffold,
};

// kanban 명령 계층 — 카드 쓰기는 전부 이 모듈의 CLI 경로로만 일어난다.
// 사람은 카드를 읽기만 하고, 에이전트는 이 명령들로만 고친다 (개선계획 §3.2).
// 서브커맨드:
//   card new "<제목>" [--goal …] [--ac … …] [--depends a,b]
//   card show <제목>
//   card edit <제목> [--goal …] [--ac … …] [--add-ac …] [--check-ac 1,2] [--note …] [--plan …]
//   pick [--claim 이름]                       원자적 집기 (락 안에서)
//   handoff <제목> --question "…"             review로 park + 클레임 반납
//   done <제목> --result "…"                  완료 — Result 없으면 거부
//   supersede <제목> --by a,b                 대체 — 부모는 superseded/로 소멸
//   abandon <제목> --reason "…"               폐기 — 사유 없으면 거부
//   board [--json]                            유도 뷰 (컬럼/WIP/대기/만료 클레임)
const fs = require('fs');
const path = require('path');
const { findDocRoot } = require('./find-doc-root');
const kanban = require('./kanban');

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
        value = rest[i + 1];
        i++;
      }
      value = value === undefined ? true : value;
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

// 보드가 스캐폴드돼 있어야 한다 — 없으면 init으로 안내.
function requireBoard() {
  const docRoot = findDocRoot();
  const paths = kanban.kanbanPaths(docRoot);
  if (!fs.existsSync(paths.kanbanDir)) {
    fail('doc/kanban/ 이 없다. 먼저 `llm-wiki init`을 실행하라.');
  }
  return { docRoot, paths, config: kanban.loadConfig(paths) };
}

function nowIso() { return localIso(); }

// ── card new / show / edit ──────────────────────────────────────────────

function cardNew(paths, config, { positional, flags }) {
  const title = positional[0];
  if (!title) fail('사용법: llm-wiki card new "<제목>" [--goal …] [--ac …]');

  const fileName = `${kanban.slugify(title)}.md`;
  const filePath = path.join(paths.cardsDir, fileName);
  if (fs.existsSync(filePath)) {
    fail(`같은 제목 카드가 이미 있다: ${filePath} — 제목이 곧 식별자다(3.5). 다른 제목을 쓰거나 supersede로 대체하라.`);
  }

  // ordinal: float, 스텝 1000, 컬럼(todo) 내 순서 (Backlog.md 방식).
  const ordinals = kanban.listCardsInDir(paths.cardsDir).map(c => Number(c.meta.ordinal) || 0);
  const ordinal = ordinals.length ? Math.max(...ordinals) + 1000 : 1000;

  const dependsOn = asArray(flags.depends).flatMap(s => String(s).split(',')).map(s => s.trim()).filter(Boolean);
  const acTexts = asArray(flags.ac);

  const meta = {
    title,
    status: 'todo',
    ordinal,
    created: new Date().toISOString().split('T')[0],
  };
  if (dependsOn.length) meta.depends_on = dependsOn;

  const parsed = {
    goal: flags.goal ? String(flags.goal) : '',
    ac: acTexts.map((text, i) => ({ checked: false, idx: i + 1, text })),
    sections: new Map([['Plan', ''], ['Notes', ''], ['Handoff', ''], ['Result', '']]),
  };

  fs.writeFileSync(filePath, kanban.serializeCard(meta, parsed));
  kanban.appendActivity(paths, { action: 'created', title });
  console.log(`Card created: ${filePath}`);
  console.log(`  ordinal: ${ordinal}${dependsOn.length ? `, depends_on: ${dependsOn.join(', ')}` : ''}`);
}

function cardShow(paths, { positional }) {
  const title = positional[0];
  if (!title) fail('사용법: llm-wiki card show <제목>');
  const cardObj = kanban.findCard(paths, title);
  if (!cardObj) fail(`카드를 못 찾았다: ${title}`);
  console.log(fs.readFileSync(cardObj.filePath, 'utf8'));
}

function cardEdit(paths, { positional, flags }) {
  const title = positional[0];
  if (!title) {
    fail('사용법: llm-wiki card edit <제목> [--goal …] [--ac …] [--add-ac …] [--check-ac 1,2] [--note …] [--plan …]');
  }
  const cardObj = kanban.findCard(paths, title);
  if (!cardObj) fail(`카드를 못 찾았다: ${title}`);

  const meta = { ...cardObj.meta };
  const parsed = { goal: cardObj.card.goal, ac: cardObj.card.ac.map(a => ({ ...a })), sections: new Map(cardObj.card.sections) };

  if (flags.goal !== undefined) parsed.goal = String(flags.goal);
  if (flags.plan !== undefined) parsed.sections.set('Plan', String(flags.plan));

  // --ac는 목록 전체 교체, --add-ac는 뒤에 붙이기(번호는 최대+1 — 재정렬 후에도 #N 안정).
  const replaceAc = asArray(flags.ac);
  if (replaceAc.length) {
    parsed.ac = replaceAc.map((text, i) => ({ checked: false, idx: i + 1, text: String(text) }));
  }
  const addAc = asArray(flags['add-ac']);
  let nextIdx = parsed.ac.reduce((m, a) => Math.max(m, a.idx), 0) + 1;
  for (const text of addAc) parsed.ac.push({ checked: false, idx: nextIdx++, text: String(text) });

  // --check-ac 1,2 — AC는 객관적 증거로만 체크하라는 건 에이전트의 규율(루프 스킬)이고
  // CLI는 번호의 안정성(#N)만 보장한다.
  if (flags['check-ac'] !== undefined) {
    const idxs = String(flags['check-ac']).split(',').map(s => Number(s.trim()));
    for (const idx of idxs) {
      const ac = parsed.ac.find(a => a.idx === idx);
      if (!ac) fail(`AC #${idx} 가 없다 — 번호는 재정렬해도 유지된다.`);
      ac.checked = true;
    }
  }

  // Notes는 append-only 저널 — 타임스탬프와 함께 덧붙인다.
  const notes = asArray(flags.note);
  if (notes.length) {
    const existing = parsed.sections.get('Notes') || '';
    const stamped = notes.map(n => `- ${nowIso()} — ${n}`).join('\n');
    parsed.sections.set('Notes', existing ? `${existing}\n${stamped}` : stamped);
  }

  kanban.writeCard(cardObj, meta, parsed);
  console.log(`Card edited: ${cardObj.filePath}`);
}

// ── pick — 원자적 집기 ───────────────────────────────────────────────────

// 준비 필터(미클레임/만료/의존 충족/WIP 여유) → ordinal 정렬 → 클레임 → doing.
// 전 과정을 락 안에서 — 동시 pick 빈틈을 처음부터 막고 출발한다 (kanban-md 교훈).
function pick(options = {}) {
  const { paths, config } = requireBoard();
  const { flags } = parseArgs(options.rest || []);
  const claimName = flags.claim ? String(flags.claim) : 'unnamed-agent';

  const result = kanban.withLock(paths, 'pick', () => {
    const active = kanban.listCardsInDir(paths.cardsDir);
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
    for (const cardObj of active) {
      const status = cardObj.meta.status;
      // review는 사람 판정 대기 — pick이 집지 않는다.
      if (status === 'review') continue;

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
        console.log(`  - ${b.title}${b.unmet && b.unmet.length ? ` — 의존 미충족: ${b.unmet.join(', ')}` : ''}${b.claimedBy ? ` — 클레임 중: ${b.claimedBy}` : ''}`);
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
  const question = flags.question;
  if (!title || !question) fail('사용법: llm-wiki handoff <제목> --question "…"');

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
}

function doneCard(options = {}) {
  const { paths } = requireBoard();
  const { positional, flags } = parseArgs(options.rest || []);
  const title = positional[0];
  const result = flags.result;
  if (!title || !result) fail('사용법: llm-wiki done <제목> --result "…" — Result 없는 완료는 거부한다.');

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
  kanban.moveCardTo(cardObj, paths.doneDir, 'done');
  kanban.appendActivity(paths, { action: 'done', title: meta.title });
  console.log(`Done: ${path.join(paths.doneDir, cardObj.fileName)}`);
}

// 대체 — 이 카드가 저 카드들이 됨. 부모는 완료가 아니라 소멸(3.1).
function supersede(options = {}) {
  const { paths } = requireBoard();
  const { positional, flags } = parseArgs(options.rest || []);
  const title = positional[0];
  const by = asArray(flags.by).flatMap(s => String(s).split(',')).map(s => s.trim()).filter(Boolean);
  if (!title || !by.length) fail('사용법: llm-wiki supersede <제목> --by 자식1,자식2');

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
  kanban.moveCardTo(parent, paths.supersededDir, 'superseded');
  kanban.appendActivity(paths, { action: 'superseded', title: parent.meta.title, detail: `by ${by.join(', ')}` });
  console.log(`Superseded: ${parent.meta.title} → [${by.join(', ')}]`);
  console.log(`  parent: ${path.join(paths.supersededDir, parent.fileName)}`);
}

// 폐기 — 사유가 가장 값비싼 정보다(3.3). 없으면 거부하고, 기록은 지우지 않는다.
function abandon(options = {}) {
  const { paths } = requireBoard();
  const { positional, flags } = parseArgs(options.rest || []);
  const title = positional[0];
  const reason = flags.reason;
  if (!title || !reason) fail('사용법: llm-wiki abandon <제목> --reason "…" — 폐기 사유가 안티패턴의 원재료다.');

  const cardObj = requireActiveCard(paths, title);
  const meta = { ...cardObj.meta, discard_reason: String(reason) };
  kanban.writeCard(cardObj, meta);
  kanban.moveCardTo(cardObj, paths.abandonedDir, 'abandoned');
  kanban.appendActivity(paths, { action: 'abandoned', title: cardObj.meta.title, detail: String(reason) });
  console.log(`Abandoned: ${path.join(paths.abandonedDir, cardObj.fileName)}`);
}

// ── board — 유도 뷰 ──────────────────────────────────────────────────────

// 카드가 정본이고 이 출력은 유도물이다 (3.7 원칙 2 — 갱신을 강제하지 않는다).
function boardView(options = {}) {
  const { paths, config } = requireBoard();
  const active = kanban.listCardsInDir(paths.cardsDir);
  const byStatus = status => active
    .filter(c => c.meta.status === status)
    .sort((a, b) => (Number(a.meta.ordinal) || 0) - (Number(b.meta.ordinal) || 0));

  const todo = byStatus('todo');
  const doing = byStatus('doing');
  const review = byStatus('review');
  const wipLimit = config.wipLimits.doing;

  const view = {
    schemaVersion: 1,
    kind: 'kanban-board',
    generatedAt: new Date().toISOString(),
    wip: { doing: { used: doing.length, limit: wipLimit } },
    columns: {
      todo: todo.map(c => viewCard(c, config)),
      doing: doing.map(c => viewCard(c, config)),
      review: review.map(c => viewCard(c, config)),
    },
    terminal: {
      done: kanban.listCardsInDir(paths.doneDir).length,
      superseded: kanban.listCardsInDir(paths.supersededDir).length,
      abandoned: kanban.listCardsInDir(paths.abandonedDir).length,
    },
  };

  if (options.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  renderBoard(view, config);
}

function viewCard(cardObj, config) {
  const expired = cardObj.meta.status === 'doing' && kanban.isClaimExpired(cardObj, config);
  return {
    title: cardObj.meta.title,
    ordinal: Number(cardObj.meta.ordinal) || 0,
    claimedBy: cardObj.meta.claimed_by || null,
    claimExpired: expired,
    dependsOn: cardObj.meta.depends_on || [],
  };
}

function renderBoard(view, config) {
  const line = '────────────────────────────────────────';
  console.log(`Kanban board (${view.generatedAt.split('T')[0]}) — 정본은 doc/kanban/ 카드 파일들`);
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
  for (const c of view.columns.review) console.log(`  • ${c.title}`);

  console.log(line);
  console.log(`TODO (${view.columns.todo.length}) — ordinal 순`);
  const resolved = new Set();
  // 의존 충족 표시를 위해 종결 제목을 모은다.
  const kanbanPaths = kanban.kanbanPaths(findDocRoot());
  for (const dir of [kanbanPaths.doneDir, kanbanPaths.supersededDir]) {
    for (const c of kanban.listCardsInDir(dir)) resolved.add(c.meta.title);
  }
  if (!view.columns.todo.length) console.log('  (비어 있음)');
  for (const c of view.columns.todo) {
    const unmet = c.dependsOn.filter(dep => !resolved.has(dep));
    console.log(`  • ${c.title}${unmet.length ? `  [대기 — 의존: ${unmet.join(', ')}]` : ''}`);
  }

  console.log(line);
  console.log(`종결: done ${view.terminal.done} · superseded ${view.terminal.superseded} · abandoned ${view.terminal.abandoned}`);
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
  dispatchCard,
  pick,
  handoff,
  doneCard,
  supersede,
  abandon,
  boardView,
  scaffold: kanban.scaffold,
};

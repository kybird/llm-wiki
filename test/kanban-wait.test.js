// llm-wiki wait 회귀 테스트 — 임시 보드(LLM_WIKI_ROOT)에서 실제 CLI를 spawn한다.
// 종료 코드 계약(0=이벤트/2=타임아웃)과 진입 검사·필터·깨진 줄·파일 부재·stall을 못박는다.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');

function makeBoard() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-wait-'));
  const docRoot = path.join(tmp, 'doc');
  require('../lib/kanban').scaffold(docRoot);
  const env = {
    ...process.env,
    LLM_WIKI_ROOT: docRoot,
    LLM_WIKI_STATE_DIR: path.join(tmp, 'state'), // auto-update 스탬프를 임시 보드 안에 가둔다
    // 폴링 폴백을 테스트 속도로 — 이 테스트들은 fs.watch 신뢰성을 가정하지 않는다.
    LLM_WIKI_WAIT_POLL_MS: '200',
  };
  const activity = path.join(docRoot, 'kanban', 'activity.jsonl');
  const run = (args, opts = {}) => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8', ...opts });
  const spawnWait = (args) => {
    const child = spawn('node', [CLI, ...args], { env });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; });
    // out은 게터로 접근한다 — 구조 분해하면 그 순간의 빈 문자열 원시값이 복사돼
    // 이후 도착하는 데이터가 절대 반영되지 않는다(2026-09-12 디버깅 실측).
    return { child, get out() { return out; } };
  };
  return {
    tmp, docRoot, env, activity, run, spawnWait,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const evLine = (action, ts, title) => JSON.stringify({ ts, action, title });
// 'exit'가 아니라 'close'를 기다린다 — 'exit'는 stdout 파이프에 남은 데이터가 부모에게
// 전달되기 전에 터진다. 이벤트 한 줄을 읽기도 전에 assert하면 빈 문자열을 보게 된다.
const exitOf = (proc) => new Promise((res, rej) => { proc.on('error', rej); proc.on('close', res); });

test('진입 검사 — --since 이후 이벤트가 이미 있으면 기다리지 않고 즉시 0', () => {
  const b = makeBoard();
  try {
    fs.writeFileSync(b.activity, [
      evLine('done', iso(-3600e3), '한 시간 전 완료'),
      evLine('handoff', iso(-60e3), '밀린 판정'),
    ].join('\n') + '\n');
    const t0 = Date.now();
    const r = b.run(['wait', '--for', 'handoff', '--since', iso(-120e3), '--timeout', '10']);
    assert.equal(r.status, 0, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('handoff') && r.stdout.includes('밀린 판정'), `이벤트를 출력해야 한다: ${r.stdout}`);
    assert.ok(!r.stdout.includes('한 시간 전 완료'), '--since 이전 이벤트는 해당 없다');
    assert.ok(Date.now() - t0 < 9000, '기다리지 않고 즉시 종료해야 한다 (타임아웃 10초보다 훨씬 전)');
  } finally { b.cleanup(); }
});

test('대기 중 이벤트 추가 — activity.jsonl이 통째로 다시 쓰여도 깨어나 0으로 종료한다', async () => {
  const b = makeBoard();
  try {
    fs.writeFileSync(b.activity, evLine('done', iso(-3600e3), '과거 완료') + '\n');
    const w = b.spawnWait(['wait', '--for', 'handoff', '--since', iso(-10e3), '--timeout', '30']);
    const codeP = exitOf(w.child);
    // 0.5초 뒤 append가 아니라 통째로 재작성한다 — 병합 충돌 수습과 같은 형태(오프셋 금지 규칙).
    setTimeout(() => {
      fs.writeFileSync(b.activity, evLine('handoff', iso(0), '도착한 판정') + '\n');
    }, 500);
    const code = await codeP;
    assert.equal(code, 0);
    assert.ok(w.out.includes('도착한 판정'), `그 이벤트를 출력해야 한다: ${w.out}`);
  } finally { b.cleanup(); }
});

test('타임아웃 — 2로 종료하고 stdout에 아무것도 출력하지 않는다', () => {
  const b = makeBoard();
  try {
    const r = b.run(['wait', '--for', 'handoff', '--since', iso(0), '--timeout', '1']);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
  } finally { b.cleanup(); }
});

test('필터 — --for done일 때 handoff 이벤트로는 깨어나지 않는다', async () => {
  const b = makeBoard();
  try {
    const since = iso(-120e3);
    // 진입 검사가 봐야 할 handoff(대기 전)와 대기 중에 오는 handoff 둘 다 무시돼야 한다.
    fs.writeFileSync(b.activity, evLine('handoff', iso(-60e3), '진입 전 handoff') + '\n');
    const w = b.spawnWait(['wait', '--for', 'done', '--since', since, '--timeout', '1']);
    const codeP = exitOf(w.child);
    setTimeout(() => fs.appendFileSync(b.activity, evLine('handoff', iso(0), '대기 중 handoff') + '\n'), 400);
    const code = await codeP;
    assert.equal(code, 2, 'handoff는 done 필터를 깨우지 않는다 — 타임아웃으로 끝나야 한다');
    assert.equal(w.out, '');
  } finally { b.cleanup(); }
});

test('깨진 줄 — JSON 아닌 줄(병합 충돌 마커 포함)은 건너뛰고 유효한 줄만 본다', () => {
  const b = makeBoard();
  try {
    fs.writeFileSync(b.activity, [
      '<<<<<<< HEAD',
      `{"ts":"${iso(-60e3)}","action":"handoff","title":"잘린 줄 — 닫는 괄호 없음"`,
      '=======',
      '전혀 JSON이 아닌 줄',
      evLine('done', iso(-3600e3), '아주 오래전'),
      evLine('handoff', iso(-30e3), '충돌 너머의 판정'),
      '>>>>>>> feature/night',
    ].join('\n') + '\n');
    const r = b.run(['wait', '--for', 'handoff', '--since', iso(-120e3), '--timeout', '10']);
    assert.equal(r.status, 0, `깨진 줄 때문에 죽지 않는다 — stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('충돌 너머의 판정'), `유효한 이벤트를 출력해야 한다: ${r.stdout}`);
    assert.ok(!r.stdout.includes('잘린 줄'), '깨진 줄의 내용이 새어나오지 않는다');
  } finally { b.cleanup(); }
});

test('파일 부재 — activity.jsonl이 없어도 죽지 않고 생기면 깨어난다', async () => {
  const b = makeBoard();
  try {
    fs.rmSync(b.activity);
    const w = b.spawnWait(['wait', '--for', 'any', '--since', iso(-60e3), '--timeout', '15']);
    const codeP = exitOf(w.child);
    setTimeout(() => fs.writeFileSync(b.activity, evLine('created', iso(0), '첫 이벤트') + '\n'), 400);
    const code = await codeP;
    assert.equal(code, 0);
    assert.ok(w.out.includes('첫 이벤트'), `파일이 생긴 뒤의 이벤트를 출력해야 한다: ${w.out}`);
  } finally { b.cleanup(); }
});

test('stall — 무활동이 --stall-min을 넘으면 0으로 종료한다 (소수 분 허용)', async () => {
  const b = makeBoard();
  try {
    fs.writeFileSync(b.activity, evLine('done', iso(-3600e3), '오래된 활동') + '\n');
    // since 5초 전 + stall 3초(0.05분) → 진입 검사에서 마감이 이미 지났다 → 즉시 0.
    const w = b.spawnWait(['wait', '--for', 'stall', '--stall-min', '0.05', '--since', iso(-5000), '--timeout', '30', '--json']);
    const code = await exitOf(w.child);
    assert.equal(code, 0);
    const line = JSON.parse(w.out.trim());
    assert.equal(line.action, 'stall');
    assert.ok(typeof line.ts === 'string', '발사 시각이 찍혀야 한다');
  } finally { b.cleanup(); }
});

test('stall — 대기 중 새 이벤트는 마감을 미룬다', async () => {
  const b = makeBoard();
  try {
    // 0.1분(6초) 무활동 마감. 2초에 활동이 오면 마감은 그 시각부터 다시 6초 → 총 ~8초.
    const w = b.spawnWait(['wait', '--for', 'stall', '--since', iso(-100), '--stall-min', '0.1', '--timeout', '30', '--json']);
    const codeP = exitOf(w.child);
    const t0 = Date.now();
    setTimeout(() => fs.appendFileSync(b.activity, evLine('claimed', iso(0), '아직 살아있음') + '\n'), 2000);
    const code = await codeP;
    assert.equal(code, 0);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 7000, `이벤트가 마감을 밀어야 한다 — 종료까지 ${elapsed}ms (갱신이 없었다면 ~6초에 발사)`);
    assert.equal(JSON.parse(w.out.trim()).action, 'stall');
  } finally { b.cleanup(); }
});

test('인자 검증 — 모르는 플래그·잘못된 --for/--since/--timeout은 1로 실패한다', () => {
  const b = makeBoard();
  try {
    assert.notEqual(b.run(['wait', '--watch']).status, 0, '모르는 플래그');
    assert.notEqual(b.run(['wait', '--for', 'created']).status, 0, '--for 목록 밖의 값');
    assert.notEqual(b.run(['wait', '--since', '언제냐']).status, 0, '해석 불가능한 --since');
    assert.notEqual(b.run(['wait', '--timeout', '곧']).status, 0, '숫자 아닌 --timeout');
    assert.notEqual(b.run(['wait', '카드제목']).status, 0, 'wait는 위치 인자를 받지 않는다');
    // --timeout 0 = 기다리지 않는다 — 이벤트가 없으면 즉시 2.
    assert.equal(b.run(['wait', '--timeout', '0']).status, 2);
  } finally { b.cleanup(); }
});

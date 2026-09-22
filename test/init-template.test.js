// init 주입 규격 테스트 — 2026-09-21 규약(sugarScan 사용 설계 확정) 6개가
// templates/AGENTS.md 에 빠짐없이 들어가 있는지, 그리고 init 이 그 파일을 그대로
// 심는지를 끝까지 검증한다(임시 디렉터리에서 실제 init 실행 → 주입 결과 대조).
//   1 산출물 삼분법(상주 규격·협업 요청서·유일한 목록)  2 마일스톤 봉인(--scope-amend)
//   3 인터럽트 무소속 백로그 + 아침 의식('나중에' 금지)  4 review 노화 지표
//   5 마일스톤 닫힘 승격(DONE.md)·계획 문서 수명      6 카드 지시서 필수 3항
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');
const TEMPLATE = fs.readFileSync(path.join(__dirname, '..', 'templates', 'AGENTS.md'), 'utf8');

// 각 규약의 식별 문구 — 템플릿이 이걸 잃으면 규약이 주입 결과에서 사라진 것이다.
const PROTOCOL_MARKERS = {
  '1 삼분법·SSOT': ['상주 규격', '협업 요청서', '폐기', '유일한 목록', '보드 하나뿐'],
  '2 마일스톤 봉인': ['범위 봉인', '결승선이', '범위 변경', '--scope-amend', '자동 완료'],
  '3 무소속 백로그·아침 의식': ['무소속', '아침 정기 의식', '삼진', "'나중에' 금지", 'abandon'],
  '4 review 노화': ['가장 오래된 대기', '7일 초과'],
  '5 닫힘 승격·계획 문서 수명': ['DONE.md', '요약', '병행 갱신 금지', 'supersede'],
  '6 카드 지시서 양식': ['무엇을 할 것', '건드리지 말 것', '틀리기 쉬운가'],
};

test('templates/AGENTS.md — 규약 1~6의 식별 문구가 빠짐없이 들어 있다', () => {
  for (const [rule, markers] of Object.entries(PROTOCOL_MARKERS)) {
    for (const marker of markers) {
      assert.ok(TEMPLATE.includes(marker), `규약 ${rule}: '${marker}' 누락`);
    }
  }
});

test('init 주입 결과 — 실제 init 을 돌려 AGENTS.md 가 템플릿 그대로 심기는지 확인', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-init-tpl-'));
  try {
    const env = { ...process.env, LLM_WIKI_NO_AUTO_UPDATE: '1' };
    const r = spawnSync('node', [CLI, 'init'], { cwd: tmp, env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const seeded = path.join(tmp, 'AGENTS.md');
    assert.ok(fs.existsSync(seeded), 'AGENTS.md 주입');
    assert.equal(fs.readFileSync(seeded, 'utf8'), TEMPLATE, '주입 결과는 템플릿과 동일');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

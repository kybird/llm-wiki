---
status: active
version_context: "llm-wiki 테스트 스위트 (node --test, spawn 기반)"
tags: [testing, pattern]
aliases: [LLM_WIKI_STATE_DIR 밀폐, 등록부 오염, 테스트 state 격리, recordProject 오염]
created: 2026-10-03
confidence: 5
---
# tests-isolate-machine-state

llm-wiki 명령을 spawn하는 테스트는 반드시 `LLM_WIKI_STATE_DIR`을 임시 디렉터리로 밀폐한다 —
안 그러면 board·monitor류 명령이 실제 기계 상태(`~/.llm-wiki/projects.json` 등록부,
`~/.llm-wiki/auto-update/` 스탬프)에 temp 프로젝트를 기록한다.

## The Rule

```js
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-<suite>-state-'));
function run(args, cwd) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd, encoding: 'utf8',
    env: { ...process.env, LLM_WIKI_STATE_DIR: STATE },
  });
}
test.after(() => { try { fs.rmSync(STATE, { recursive: true, force: true }); } catch {} });
```

- spawn으로 도는 모든 llm-wiki 명령(board·search·monitor·pick…)에 적용 — recordProject는
  auto-update와 monitor 시작이 매번 부른다.
- 임시 docRoot 실험도 같은 규칙(LLM_WIKI_STATE_DIR 밀폐) — 레포 안 .agents 사본 회귀와는 별개 축.
- 테스트 파일을 **새로 만들 때** 이 규칙을 스스로 적용해야 한다 — 기존 파일들은 지키고 있어도
  전파되지 않는다(2026-10-03 재발이 정확히 이 경로).

## Why it works

오염은 조용하다 — 테스트는 통과하고 콘솔 출력도 멀쩡한데, 플릿(`monitor --all`)을 열어봐야
죽은 temp 보드 타일로 보인다. 통과 개수로는 잡히지 않는 유형이라 관례의 문서화가 유일한 예방.

## Trade-offs

- 밀폐하면 스탬프·등록부가 매 런 새로 시작 — auto-update 테스트처럼 스탬프 상태를 다루는
  테스트는 오히려 이 밀폐가 전제다. 비용 없음.

## Anti-Pattern

- "임시 레포니까 state도 자연히 분리되겠지" — state는 cwd가 아니라 홈 디렉터리에 산다.
- 오염 발견을 "지웠다"로만 끝내기 — 격리 추가가 수습의 본체다(2026-09-19 사고의 재발 원인).

## Related

- [[npm-scoped-publishing]] — 같은 "~/.npmrc·~/.llm-wiki는 기계 상태" 인식
- [[probing-side-effect-commands]] — 무해해 보이는 호출의 부작용
- [[test-manifest-swallows-new-tests]] — 새 테스트 파일의 두 번째 함정(첫째는 목록 편입)

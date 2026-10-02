---
status: active
version_context: "node --test (npm test 스크립트가 파일 목록을 명시하는 형태)"
tags: [testing, anti-pattern]
aliases: [npm test 명시 목록, 테스트 파일 목록 함정, scripts.test 편입, 신규 테스트 미실행, realpathSync ENOENT, 폴백 경로 존재 검증]
created: 2026-10-02
confidence: 5
---
# test-manifest-swallows-new-tests

`npm test`가 `node --test test/a.test.js test/b.test.js …`처럼 **파일 목록을 명시**하면,
새 테스트 파일은 목록에 편입되기 전까지 조용히 무시된다 — 통과 개수가 늘지 않아 탐지 불가,
"npm test 통과"라는 done Result가 신규 테스트의 실행 증거로 위장한다.

## Failure Mode

1. 신규 테스트 파일을 test/에 만들고 개별 실행(`node --test test/new.test.js`)으로 통과 확인.
2. package.json scripts.test에 **편입을 잊고** done — npm test는 목록의 구 파일만 돌려 통과.
3. Result에 "신설 N종 — npm test 전부 통과"라고 쓰면 독자가 둘을 연결해 과장이 된다.
   실제로 그 테스트는 스위트에서 한 번도 실행된 적이 없다.

짝 케이스(편입의 실익을 증명하는 2차 결함): 목록 편입 후 **첫 전체 실행**에서 드러난
헬퍼 전제 충돌 —

```
Error: ENOENT: no such file or directory, realpath 'C:\Users\admin\AppData\Local\Temp\kb-layout-empty-xyFD8n\sub-yUFjMp\docs'
    at realpathSync.native (node:fs:2837:18)
```

기존 테스트의 realpathSync 기반 경로 비교 헬퍼는 "비교 대상이 존재한다"를 암묵 전제하는데,
findDocRoot의 init 전 폴백은 경로를 계산만 하고 생성하지 않아 ENOENT로 깨진다. 공유 테스트
헬퍼를 재사용하면 전제도 함께 전파된다 — 존재 검증과 경로 동등성 검증은 다른 검증이고,
존재하지 않을 수 있는 대상은 resolve+대소문자 정규화의 문자열 비교여야 한다.

## Prevention Checklist

- [ ] 신규 테스트 파일을 만들면 **같은 커밋에서** scripts.test 목록에 편입한다(별도 커밋으로 미루면 잊는다).
- [ ] "npm test 통과"를 신규 테스트의 실행 증거로 쓰지 않는다 — 편입 확인 후의 통과만 증거다.
- [ ] Result 문장은 증거 범위를 실제 실행과 일치시킨다([[write-validation-matches-read-semantics]]).
- [ ] 목록 편입 후 첫 전체 실행은 신규 테스트와 기존 헬퍼의 전제 충돌이 처음 만나는 자리다 — 개별 실행 통과는 전체 통과가 아니다.
- [ ] 테스트 헬퍼의 암묵적 전제(존재·플랫폼·cwd)를 재사용 전에 점검한다.

## Anti-Pattern

- "개별 실행이 통과하니까 됐다" — 스위트 편입 없는 개별 통과는 회귀 게이트에 참여하지 않는 죽은 검증이다.
- 과장된 done Result를 발견 후 "고쳤다"로만 끝내기 — 정정 기록을 남겨야 QA 감사가 추적한다.

## Related

- [[write-validation-matches-read-semantics]] — Result 문장의 증거 범위 계약
- [[card-file-anatomy]] — done Result가 남는 자리와 정정 노트의 기록 규약
- [[ui-changes-need-browser-verification]] — "실행됐어야 의미 있는 검증" 계열의 다른 층(브라우저 실측)

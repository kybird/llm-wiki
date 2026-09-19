---
title: card-file-anatomy
description: 칸반 카드 파일의 내부 계약 — Goal·AC는 센티넬 특별 취급(card.goal·card.ac), sections Map은 나머지만 담는다. kind·milestone 필드는 소속/종류를 결정한다.
status: active
version_context: "llm-wiki 0.4.x, lib/kanban.js parseBody"
tags: [kanban, concept]
aliases: [카드 구조, 카드 파일 형식, sections Map, parseBody, Goal 센티넬, AC 파싱, kind milestone, milestone 필드, 소속 가드]
created: 2026-09-16
confidence: 5
---
# card-file-anatomy

> 카드 하나는 마크다운 파일 하나다: frontmatter(status·ordinal·생성일·claimed_by·
> claimed_at·not_before·depends_on) + 본문 섹션. 파서(parseBody)는 **Goal과
> Acceptance Criteria를 센티넬 블록으로 특별 취급**해 `card.goal`(문자열)·`card.ac`
> (구조화 배열)에 넣고, `card.sections` Map에는 센티넬을 제거한 나머지(Plan·Notes·
> Handoff·Result·기타)만 담는다.

## First Principles

왕복 보존(serializeCard가 센티넬을 재생성)과 구조화(AC 체크 상태·번호를 데이터로
다루기)가 필요한 두 섹션만 파서가 특별 취급한다. 파일에 `## Goal` 헤더가 **있어도**
sections Map에는 없다 — "헤더=섹션"이라는 자연스러운 모델이 틀리는 지점이고,
`sections.get('Goal')`이 undefined를 돌려주는 이유다.

## Details

- 센티넬: `<!-- kanban:goal:begin/end -->`, `<!-- kanban:ac:begin/end -->`
- `card.ac` 항목 형태: `{checked, idx, text}` — AC 본문의 줄바꿈 연속행은 앞 항목
  text에 붙는다(왕복 소실 방지, 2026-09-09 리뷰 5-2).
- 본문 전체를 내보내는 코드(모니터 /api/card)는 goal·ac를 **파일 순서(Goal → AC →
  나머지)로 재합성**해야 한다. AC 표시형: `- [x] #N 텍스트`(체크 상태 보존).
- 종결 여부는 폴더가 말한다(cards/·done/·superseded/·abandoned/) — frontmatter
  status와 일치하도록 moveCardTo가 함께 고친다.
- 제목이 곧 식별자다(plan.md 3.5) — findCard는 정확 제목 비교 후 슬러그 폴백.
  파일명이 아니라 파싱된 제목과 비교하므로 조회 키로 안전하다.
- **소속/종류 필드(0.4.x, plan.md 3.8)**: `kind: milestone`은 마일스톤 카드(pick 불가,
  멤버 전원 종결 시 자동 종결), 멤버의 `milestone: "<마일스톤 제목>"`은 소속. 소속을
  바꾸는 길(설정·재지정·해제)은 **활성 카드에만** 열려 있다 — 종결 카드의 소속과 종결
  마일스톤 자체는 회고 뷰가 읽는 이력이다. 가드는 쌍 경로(set/remove) 모두에 붙어야
  한다(2026-09-19: remove 경로 누락을 회귀 테스트가 포착).

## Related

- [[write-validation-matches-read-semantics]] — 왕복 보존 계열
- [[agent-cli-contract]] — 카드를 쓰는 건 CLI뿐이라는 계약의 대상

## Grounding (References)

- Git Context: `hash:fac5062` (/api/card 구현 중 발견)
- Evidence: doc/raw/2026-09-16.md Case 6 — 디버그 실측 `sections keys: [ 'Plan', 'Notes', 'Handoff', 'Result' ]`, `sections.get('Goal')` → undefined
- 확장(2026-09-19): `hash:281d97d` — doc/raw/2026-09-18.md Case 2 — kind·milestone 필드 문서화 + 종결 소속 가드(쌍 경로)
- 구조 실장: lib/kanban.js parseBody·serializeCard

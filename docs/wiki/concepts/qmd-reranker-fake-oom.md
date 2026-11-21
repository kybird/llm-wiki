---
status: active
version_context: "qmd 2.8.3(결함)→2.9.0(수리) · node-llama-cpp 3.20.0(결함)·3.22.1(반감)·3.22.3(수리) · NVIDIA 610.47/610.88"
tags: [qmd, cuda, crash, troubleshooting]
aliases: [리랭커 가짜 OOM, CUDA error out of memory, ggml-cuda.cu:106, rankAll 크래시, fake OOM, 공존 크래시, win32 CUDA 리랭커]
created: 2026-11-21
confidence: 5
---
# qmd 리랭커 CUDA 가짜 OOM
win32 CUDA에서 qmd `query`의 리랭크 단계가 여유 VRAM과 무관하게 `CUDA error: out of memory`로 프로세스째 죽는 상류(llama.cpp) 결함 — 트리거는 임베드 컨텍스트 상주, 수리는 **qmd 2.9.0 업그레이드**.

## The Rule (트리거와 수리)
- **필요조건 = 살아있는 임베드 '컨텍스트'가 상주한 채 `rankAll` 실행.** 소거 행렬(S1-S7 × 5회): S4 임베드 상주+리랭크 3/5·S1 qmd 풀스택 4/5 크래시 ↔ S2 임베드만·S3 리랭크만·S5 랭킹 2컨텍스트 병렬·S6 임베드 완전 폐기·S7 컨텍스트만 폐기(웨이트 상주) **전부 0/5**. 웨이트 상주·전환 이력·동시 실행 무관(유휴 컨텍스트의 존재만으로 충분).
- **수리 = qmd 2.9.0**(node-llama-cpp 3.22.3 동봉). 3계층 실측: 하네스 S4 0/5 · S1 풀스택 0/10(속도도 상승) · llm-wiki search 종단 10연속 무크래시.
- **안전망 유지**: llm-wiki의 자동 vulkan 강하(efe4c14) — CUDA error 마커 감지 시 같은 수집을 1회 재시도(~4× 느림). 구버전 qmd 기기·미지 결함용.
- qmd는 임베드 풀을 5분간 웜유지(비활성 타임아웃)하므로 `qmd query`는 매번 트리거 조건을 만든다 — 직렬화(win32 CUDA parallelism=1) 아래 재현된 이유도 이것.

## Why (근거)
- 크래시 순간 여유 VRAM 실측: 12,341MB(2026-10-13)·≈6.7GB(2026-11-21) — 진짜 OOM이 아니다.
- **기각된 가설(전부 실측)**: 리랭커 모델 단독(S3)·#519 동시 랭킹 컨텍스트(S5)·임베더 단독(S2)·PATH/DLL 구성·지연로드 해석·드라이버(10-13 C4 정정: 해법 레버는 prebuilt 로드성)·리랭커 모델 교체(11-21 폐기 카드 — 트리거가 모델이 아니므로 교체로 못 막음).
- **기각된 수습**: 리랭크 컨텍스트 축소(2048/3072)·MMQ/CUBLAS 강제·n-l-c 3.22.1 bisect(반감일 뿐).

## 진단 주의
- 검색 결과 문서가 'CUDA error' 문자열을 **인용**한다 — grep 판정은 `│` 인용 라인 제외 후 세라(실측: 포함 3 → 제외 0).
- "X로도 못 막는다"류 기록은 **버전을 남겨라** — 3.22.1은 반감, 3.22.3은 수리. 버전 없는 결론이 다음 세션을 해결된 벽에 다시 세운다.
- CPU 강제(`QMD_LLAMA_GPU=false`)는 리랭크 21청크 ~650초 — 120초 타임아웃 초과로 우회 불가.

## Anti-Pattern
"CUDA error = OOM = VRAM 부족" 읽기 · "크래시니까 PATH/DLL부터 의심" — 재현 스크립트 조건 실험이 먼저다.

## Related
- [[qmd-optional-dependency]] · [[cuda-version-coexistence]](다른 병 — 다중 버전 공존 아님) · [[silent-failure-impersonates-normal-limit]]

## Grounding (References)
- [[2026-10-13]] Case 1·3·4 — 격리 재현(리랭커 단독 6/6·임베딩 상주 11/13), PATH/DLL·환경 지렛대 전면 기각, prebuilt 로드성 정정
- [[2026-11-21]] Case 2 — 소거 행렬 S1-S7 트리거 확정·2.9.0 수리 실측·오탐 함정 (hash e224d10·d662777·72bde9e, 마일스톤 4/4·판정 adopted)
- 재현 하네스: `scripts/qmd-cuda-repro/` — 상류 리포트용 최소 재현은 `case.js S4`, 처방 검증은 S7 구성

---
title: CUDA Version Coexistence
description: 여러 CUDA 버전을 공존시키면 prebuilt 바이너리가 깨지고 소스빌드 지옥으로 빠진다.
status: active
created: 2026-08-29
tags: [anti-pattern, antipattern]
aliases: [STL1002, cublas64 DLL conflict, win-x64-cuda load failure]
---

# CUDA Version Coexistence

> 여러 CUDA 버전(CUDA 11.8 + 13.x 등)이 한 머신에 공존하면 `win-x64-cuda` prebuilt가
> DLL 충돌로 로드 실패하고, 소스빌드로 떨어지며 MSVC↔CUDA 버전 위반이 터진다.

### Grounding
- Evidence: TROUBLESHOOTING.md, doc/raw/2026-08-29.md Case 1
- Confidence: 5/5

### Error
error STL1002: Unexpected compiler version, expected CUDA 12.4+

### Analysis
- Prebuilt ggml-cuda DLL은 특정 `cublas64_XX.dll`을 import한다 — 버전이 섞이면
  prebuilt 로드가 실패해 소스빌드(CMake/MSBuild)로 떨어진다.
- VS 2022 자동 업데이트가 MSVC를 밀어 올리면 CUDA Toolkit을 같이 안 올린 빌드가 죽는다.
  GPU 하드웨어/드라이버 상태와 무관.
- 해결: CUDA 버전을 하나만 유지 → prebuilt가 깨끗히 로드되고 소스빌드는 시도조차 안 된다.
- 런타임 `CUDA error: out of memory`는 별개 문제 — 일시적 드라이버/VRAM 상태이며
  `QMD_LLAMA_GPU=false`로 그 실행만 CPU 강제한다. (`NODE_LLAMA_CPP_GPU`는 아무것도
  읽지 않는 이름이다.)

### Related Knowledge
- Patterns: [[Header Date Over Mtime]]

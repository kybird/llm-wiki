# Troubleshooting: QMD / node-llama-cpp build-time CUDA failures

> This document covers Windows + NVIDIA-specific diagnostics for the optional `@tobilu/qmd` dependency (used by `llm-wiki compile index` for semantic search embeddings). If `compile index` prints `falling back to using Vulkan` or a `CUDA error`, consult this.
>
> QMD is **optional**. Without it, `llm-wiki search` falls back to grep and the wiki index still rebuilds correctly.

## Runtime CUDA OOM vs build-time compile failure

These are two different failure modes:

| Symptom | Cause | Fix |
|---|---|---|
| `CUDA error: out of memory` at runtime | Transient driver/VRAM state, GPU asleep | `QMD_LLAMA_GPU=false` for that run |
| `error STL1002: Unexpected compiler version, expected CUDA 12.4+` | MSVC + CUDA Toolkit mismatch at build time | Upgrade CUDA Toolkit (see below) |

## Variable name reminder

Use **`QMD_LLAMA_GPU`** to force CPU. Do **not** use `NODE_LLAMA_CPP_GPU` — it is read by nothing in the qmd codebase and has no effect.

## node-llama-cpp v3.x prebuilt binary resolution

node-llama-cpp v3.x ships prebuilt binaries as npm `optionalDependencies`. `getLlama({build: "autoAttempt"})` priority:

1. **Prebuilt binary load** — `node_modules/@node-llama-cpp/<platform>/bins/.../llama-addon.node`. No MSBuild needed; only matching CUDA runtime DLLs required.
2. **Source build** (CMake/MSBuild) — reached only if (1) fails.
3. **Other backend fallback** (Vulkan, CPU).

**Most common real-world failure**: multiple CUDA versions coexisting → prebuilt DLL conflict. Example: CUDA 11.8 + 13.x coexist → `win-x64-cuda` prebuilt fails to load → falls to source build → exposes `.targets` problems.

**Fix (restore prebuilt path)**: keep only one CUDA version installed. Then prebuilt loads cleanly and source build is never attempted.

## Required CUDA version for prebuilt binaries

The prebuilt ggml-cuda DLL imports a specific `cublas64_XX.dll`. Check which one your installed prebuilt expects:

```powershell
$dll = "node_modules\@node-llama-cpp\win-x64-cuda\bins\win-x64-cuda\ggml-cuda.dll"
$bytes = [System.IO.File]::ReadAllBytes($dll)
$ascii = [System.Text.Encoding]::ASCII.GetString($bytes)
[regex]::Matches($ascii, "cublas64_\w+\.dll") | ForEach-Object { $_.Value } | Sort-Object -Unique
# cublas64_13.dll → CUDA 13.x required
# cublas64_12.dll → CUDA 12.x required
```

Install the matching CUDA Toolkit. The NVIDIA driver's `nvidia-smi` "CUDA Version" shows the max runtime the driver supports natively; if the Toolkit exceeds it, Forward Compatibility kicks in and some prebuilts break there too.

## MSVC / CUDA Toolkit version matrix

MSVC's `yvals_core.h` static assertion enforces a minimum CUDA version at compile time:

| MSVC version | Required CUDA minimum |
|---|---|
| 14.39 and below | CUDA 11.x allowed |
| 14.40–14.43 | CUDA 12.0+ recommended |
| **14.44+** | **CUDA 12.4+ required** |

VS 2022 auto-updates push MSVC forward, so if you don't upgrade CUDA Toolkit alongside it, build-time compatibility violations occur. **Unrelated to GPU hardware/driver state.**

## VS BuildCustomizations (.targets) conflict

> If CUDA Toolkit is upgraded but the build still invokes an old `nvcc.exe`, suspect this.

**Symptom**: After installing CUDA 13.x, CMake logs `Found CUDAToolkit: ...v13.3` correctly, but MSBuild still calls `v11.8\bin\nvcc.exe` during compilation → same `error STL1002`.

**Root cause**: stale CUDA `.targets` files in VS 2022 BuildCustomizations:

```
C:\Program Files\Microsoft Visual Studio\2022\<Edition>\MSBuild\Microsoft\VC\v170\BuildCustomizations\
├── CUDA 11.8.props   ← stale
├── CUDA 11.8.targets ← stale (hardcodes old nvcc path)
└── CUDA 11.8.xml     ← stale
```

MSBuild loads `.targets` regardless of CMake's CUDA detection. Environment variables (`CUDACXX`, `CMAKE_CUDA_COMPILER`, `CUDA_PATH`) cannot override it.

**Trigger**: unchecking "Visual Studio Integration" during CUDA Toolkit upgrade leaves the old `.targets` in place.

**Fix** (admin PowerShell):

```powershell
$dir = "C:\Program Files\Microsoft Visual Studio\2022\<Edition>\MSBuild\Microsoft\VC\v170\BuildCustomizations"
Remove-Item "$dir\CUDA 11.8.props" -Force
Remove-Item "$dir\CUDA 11.8.targets" -Force
Remove-Item "$dir\CUDA 11.8.xml" -Force
```

Or: Control Panel → uninstall "NVIDIA CUDA Visual Studio Integration 11.8".

Removing `.targets` does **not** delete the CUDA 11.8 toolkit itself — other projects can still use the v11.8 path explicitly. Side-by-side coexistence is preserved.

## Detection priority

1. Look for `falling back to using Vulkan` in `compile index` output → prebuilt DLL conflict (stage 1 failed).
2. Check for `error STL1002` or `expected CUDA 12.4 or newer` in the same output → MSVC/CUDA mismatch.
3. Compare `nvcc --version` against the VS 2022 MSVC version (`cl.exe` 19.44+ needs CUDA 12.4+).
4. Final result `✓ Done!` means embedding succeeded (functionally OK, only performance degraded).

## Anti-patterns (do not do)

- ❌ `NODE_LLAMA_CPP_GPU=false` — read by nothing; ineffective.
- ❌ "GPU failed so force CPU" for a **build-time** compiler mismatch — runtime env var can't fix a compile error.
- ❌ "Leave Vulkan fallback, it works" — ~16× slower than GPU; costly if you compile frequently.
- ❌ "CUDA 11.8 is stable, keep it" — VS 2022 auto-update forces MSVC up, making 11.8 unsustainable.

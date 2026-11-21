#!/usr/bin/env node
// qmd 리랭커 CUDA 가짜 OOM — 소거 행렬 러너 (case.js를 시나리오별 N회 spawn해 집계한다)
//
// 시나리오:
//   S1 qmd-query       — qmd CLI query 풀스택(확장→임베드→리랭크). 기준선·재현 확인
//   S2 embed-only      — 임베딩 단독. 임베더가 크래시의 씨앗인지 소거
//   S3 rerank-only     — 리랭크 단독(선형 컨텍스트). 모델·rankAll 연산 축 검증
//   S4 embed-then-rank — 임베드 상주 + 리랭크. 모델·컨텍스트 공존 축 검증
//   S5 rerank-parallel2— 랭킹 컨텍스트 2개 병렬(#519 동시성 축 — 양성 대조군)
//
// 호출: node matrix.js [N=5] [시나리오들… 기본 전부]
// 출력: 콘솔 표 + scripts/qmd-cuda-repro/results-<ts>.json
// 판정 재료: crash = stderr "CUDA error" 마커 + 비정상 exit code + ggml-cuda.cu 라인.

"use strict";

const { spawn, execSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const HERE = __dirname;
// qmd CLI 진입점은 lib/find-qmd.js 탐색을 재사용(글로벌/로컬/환경변수 전부 대응).
const QMD_BIN = require(join(HERE, "..", "..", "lib", "find-qmd.js")).findQmd();
const NPM_ROOT = execSync("npm root -g", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
const QMD_ROOT = join(NPM_ROOT, "@tobilu", "qmd");
const CUDA_MARKER = /CUDA error/i;
const GGML_LINE = /ggml-cuda\.cu:\d+/g;

const SCENARIOS = {
  "S1": { label: "qmd query 풀스택", argv: [process.execPath, [QMD_BIN, "query", "리랭커 CUDA 크래시 재현", "-c", "llm-wiki-wiki"]], timeoutMs: 240000 },
  "S2": { label: "임베드만", argv: [process.execPath, [join(HERE, "case.js"), "S2"]], timeoutMs: 180000 },
  "S3": { label: "리랭크만(1컨텍스트)", argv: [process.execPath, [join(HERE, "case.js"), "S3"]], timeoutMs: 180000 },
  "S4": { label: "임베드→리랭크(공존)", argv: [process.execPath, [join(HERE, "case.js"), "S4"]], timeoutMs: 180000 },
  "S5": { label: "리랭크 2컨텍스트 병렬", argv: [process.execPath, [join(HERE, "case.js"), "S5"]], timeoutMs: 180000 },
  "S6": { label: "임베드 완전 폐기→리랭크", argv: [process.execPath, [join(HERE, "case.js"), "S6"]], timeoutMs: 180000 },
  "S7": { label: "컨텍스트만 폐기→리랭크", argv: [process.execPath, [join(HERE, "case.js"), "S7"]], timeoutMs: 180000 },
};

function vramFreeMB() {
  try {
    return parseInt(execSync('nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits',
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim(), 10);
  } catch { return -1; }
}

function driverVersion() {
  try {
    return execSync('nvidia-smi --query-gpu=driver_version --format=csv,noheader',
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch { return "unknown"; }
}

// spawn 완전 회수 패턴: 스트림을 계속 소비하고 close까지 대기(빈 stdout 함정 방지).
function runOnce(id, spec) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const vramBefore = vramFreeMB();
    const child = spawn(spec.argv[0], spec.argv[1], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, spec.timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const ggml = err.match(GGML_LINE) || out.match(GGML_LINE) || [];
      resolve({
        scenario: id, run: 0, exitCode: code, signal: signal ?? null,
        crash: CUDA_MARKER.test(err) || CUDA_MARKER.test(out),
        ggmlLines: [...new Set(ggml)].slice(0, 3),
        vramFreeBeforeMB: vramBefore, vramFreeAfterMB: vramFreeMB(),
        ms: Date.now() - t0,
        lastEvent: (out.trim().split("\n").filter((l) => l.startsWith("{")).pop() || "").slice(0, 300),
      });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ scenario: id, run: 0, exitCode: -1, signal: null, crash: false, ggmlLines: [],
        vramFreeBeforeMB: vramBefore, vramFreeAfterMB: vramFreeMB(), ms: Date.now() - t0,
        lastEvent: `spawn error: ${e.message}` });
    });
  });
}

async function main() {
  const n = Math.max(1, parseInt(process.argv[2] || "5", 10) || 5);
  const requested = process.argv.slice(3).filter((x) => SCENARIOS[x]);
  const order = requested.length ? requested : Object.keys(SCENARIOS);

  const meta = { startedAt: new Date().toISOString(), n, driver: driverVersion(), node: process.version, scenarios: {} };
  try {
    meta.qmd = require(join(QMD_ROOT, "package.json")).version;
    meta["node-llama-cpp"] = require(join(QMD_ROOT, "node_modules", "node-llama-cpp", "package.json")).version;
  } catch {}

  const results = [];
  for (const id of order) {
    meta.scenarios[id] = SCENARIOS[id].label;
    for (let i = 1; i <= n; i++) {
      const r = await runOnce(id, SCENARIOS[id]);
      r.run = i;
      results.push(r);
      const mark = r.crash ? "💥CUDA" : (r.exitCode === 0 ? "ok" : `exit${r.exitCode}`);
      console.log(`${id} #${i}: ${mark} ${r.ms}ms free=${r.vramFreeBeforeMB}→${r.vramFreeAfterMB}MB ${r.ggmlLines.join(",") || ""} ${r.lastEvent.slice(0, 120)}`);
    }
  }

  // 요약: 시나리오별 크래시율
  const summary = {};
  for (const id of order) {
    const rs = results.filter((r) => r.scenario === id);
    summary[id] = {
      label: SCENARIOS[id].label,
      crashes: rs.filter((r) => r.crash).length, runs: rs.length,
      nonzeroExit: rs.filter((r) => r.exitCode !== 0).length,
      ggmlLines: [...new Set(rs.flatMap((r) => r.ggmlLines))],
      lastEventOfCrash: (rs.find((r) => r.crash) || {}).lastEvent || null,
    };
  }
  console.log("\n=== 소거 행렬 요약 ===");
  for (const [id, s] of Object.entries(summary))
    console.log(`${id} ${s.label}: ${s.crashes}/${s.runs} 크래시 (비정상종료 ${s.nonzeroExit}) ${s.ggmlLines.join(",")}`);

  const file = join(HERE, `results-${meta.startedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ meta, summary, results }, null, 2), "utf8");
  console.log(`\n결과: ${file}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

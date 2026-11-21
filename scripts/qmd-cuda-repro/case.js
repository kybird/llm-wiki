#!/usr/bin/env node
// qmd 리랭커 CUDA 가짜 OOM — 최소 재현 케이스 러너 (마일스톤: qmd 리랭커 CUDA 가짜 OOM 근본 수리)
//
// 한 프로세스가 시나리오 1개를 실행한다. CUDA 크래시는 프로세스를 통째로 죽이므로
// 반복·집계는 matrix.js가 별도 프로세스로 spawn한다(이 파일을 직접 여러 번 실행할 것).
//
// 시나리오:
//   S2 embed-only       — embeddinggemma 로드 → 컨텍스트 1개 → 23텍스트 임베딩
//   S3 rerank-only      — Qwen3-Reranker 로드 → 랭킹 컨텍스트 1개 → rankAll 21청크
//   S4 embed-then-rerank— S2를 폐기 없이 유지한 채 S3 실행(모델·컨텍스트 공존 축)
//   S5 rerank-parallel2 — 랭킹 컨텍스트 2개에 청크를 분산해 Promise.all(llm.js:1350 재현)
//
// 호출: node case.js <S2|S3|S4|S5>
// 종료코드: 0=성공, 1=JS 예외, 네이티브 크래시는 비정상 코드+stderr "CUDA error" 마커.

"use strict";

const { execSync } = require("node:child_process");
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

// 글로벌 qmd의 node-llama-cpp를 그대로 빌려 쓴다(버전·prebuilt 동일성이 재현 조건).
// npm은 .cmd라 execFileSync 직접 spawn 불가(win32) — 셸 경유 execSync(lib/find-qmd.js 방식).
const QMD_ROOT = join(execSync("npm root -g", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim(), "@tobilu", "qmd");

// node-llama-cpp v3은 top-level await ESM(ERR_REQUIRE_ASYNC_MODULE)이라 require 불가 —
// main 진입점을 직접 import한다(bare import는 이 스크립트 위치에서 해석되지 않는다).
async function loadNodeLlamaCpp() {
  const pkgRoot = join(QMD_ROOT, "node_modules", "node-llama-cpp");
  const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
  const entry = join(pkgRoot, pkg.main ?? "dist/index.js");
  return await import(require("node:url").pathToFileURL(entry).href);
}

const MODELS = join(homedir(), ".cache", "qmd", "models");
const EMBED_GGUF = join(MODELS, "hf_ggml-org_embeddinggemma-300M-Q8_0.gguf");
const RERANK_GGUF = join(MODELS, "hf_ggml-org_qwen3-reranker-0.6b-q8_0.gguf");
const WIKI_DIR = join(__dirname, "..", "..", "docs", "wiki");

const QUERY = "리랭커 CUDA 크래시 재현";
const EMBED_CONTEXT_SIZE = 2048;   // qmd LlamaCpp.EMBED_CONTEXT_SIZE 기본값
const RERANK_CONTEXT_SIZE = 4096;  // qmd LlamaCpp.RERANK_CONTEXT_SIZE 기본값

function stamp(event, extra = {}) {
  const versions = {};
  try { versions.qmd = require(join(QMD_ROOT, "package.json")).version; } catch {}
  try { versions["node-llama-cpp"] = require(join(QMD_ROOT, "node_modules", "node-llama-cpp", "package.json")).version; } catch {}
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, node: process.version, versions, ...extra }));
}

// docs/wiki(+raw)의 md 파일들을 ~900자 청크로 잘라 21개 확보(실측 크래시 조건과 같은 CJK 텍스트).
// 이 레포 wiki는 작아 부족할 수 있다 — raw까지 긁고, 그래도 부족하면 순환 보충(연산 패턴 보존).
function loadChunks(minChunks) {
  const base = [];
  for (const dir of [WIKI_DIR, join(WIKI_DIR, "..", "raw")]) {
    let files = [];
    try { files = readdirSync(dir).filter((x) => x.endsWith(".md")).sort(); } catch { continue; }
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      for (let i = 0; i < text.length && base.length < 64; i += 900)
        base.push(text.slice(i, i + 900));
    }
  }
  const chunks = [];
  for (let i = 0; chunks.length < minChunks; i++)
    chunks.push(base[i % base.length]);
  return chunks;
}

function embedQueries(n) {
  // qmd query가 만들어내는 변형 질의 모양(lex/vec/hyde 계열)을 흉내낸 고정 텍스트.
  return Array.from({ length: n }, (_, i) =>
    i === 0 ? QUERY : `${QUERY} — 변형 ${i} (${i % 3 === 0 ? "lex" : i % 3 === 1 ? "vec" : "hyde"})`);
}

async function embedPhase(llama, keep) {
  stamp("embed.load", { model: "embeddinggemma-300M" });
  const model = await llama.loadModel({ modelPath: EMBED_GGUF });
  const ctx = await model.createEmbeddingContext({ contextSize: EMBED_CONTEXT_SIZE });
  const texts = embedQueries(23);
  let done = 0;
  for (const t of texts) {
    const e = await ctx.getEmbeddingFor(t);
    if (!e || !e.vector || e.vector.length === 0) throw new Error("빈 임베딩 반환");
    done++;
  }
  stamp("embed.done", { embedded: done, dims: 0, keptAlive: keep });
  return { model, ctx }; // keep=true면 폐기하지 않는다(공존 축)
}

async function rerankPhase(llama, contexts) {
  stamp("rerank.load", { model: "Qwen3-Reranker-0.6B", contexts });
  const model = await llama.loadModel({ modelPath: RERANK_GGUF });
  const docs = loadChunks(21);
  const ctxs = [];
  for (let i = 0; i < contexts; i++)
    ctxs.push(await model.createRankingContext({ contextSize: RERANK_CONTEXT_SIZE }));
  stamp("rerank.start", { docs: docs.length });
  if (contexts === 1) {
    const scores = await ctxs[0].rankAll(QUERY, docs);
    stamp("rerank.done", { scored: scores.length });
  } else {
    // llm.js:1350 재현 — 청크를 컨텍스트 풀에 분산해 동시 rankAll
    const batches = ctxs.map(() => []);
    docs.forEach((d, i) => batches[i % contexts].push(d));
    const all = await Promise.all(batches.map((b, i) => ctxs[i].rankAll(QUERY, b)));
    stamp("rerank.done", { scored: all.reduce((a, s) => a + s.length, 0), parallel: contexts });
  }
  return { model, ctxs };
}

async function main() {
  const scenario = process.argv[2];
  if (!["S2", "S3", "S4", "S5", "S6", "S7"].includes(scenario)) {
    console.error("usage: node case.js <S2|S3|S4|S5|S6|S7>");
    process.exit(1);
  }
  for (const p of [EMBED_GGUF, RERANK_GGUF]) {
    try { statSync(p); } catch { console.error(`모델 없음: ${p}`); process.exit(1); }
  }
  stamp("start", { scenario });
  const { getLlama } = await loadNodeLlamaCpp();
  const llama = await getLlama(); // qmd 기본과 동일: gpu auto, build auto
  stamp("llama.ready", { gpu: String(llama.gpu) });

  if (scenario === "S2") await embedPhase(llama, false);
  else if (scenario === "S3") await rerankPhase(llama, 1);
  else if (scenario === "S4") { await embedPhase(llama, true); await rerankPhase(llama, 1); }
  else if (scenario === "S5") await rerankPhase(llama, 2);
  else if (scenario === "S6") { // 임베드 완전 폐기 → 리랭크: 상주가 필요조건인지 판정
    const e = await embedPhase(llama, true);
    e.ctx.dispose(); e.model.dispose();
    stamp("embed.disposed", {});
    await rerankPhase(llama, 1);
  }
  else if (scenario === "S7") { // 컨텍스트만 폐기(웨이트 상주) → 리랭크: 컨텍스트 vs 웨이트 축 분리
    const e = await embedPhase(llama, true);
    e.ctx.dispose();
    stamp("embed.ctx-disposed", {});
    await rerankPhase(llama, 1);
  }

  stamp("case.ok", { scenario });
  process.exit(0);
}

main().catch((err) => {
  stamp("case.fail", { scenario: process.argv[2], error: String(err && err.message || err) });
  process.exit(1);
});

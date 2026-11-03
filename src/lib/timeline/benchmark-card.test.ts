import assert from "node:assert/strict";
import test from "node:test";
import { resolveBenchmarkCardData } from "./benchmark-card";

test("resolves a two-model benchmark card from the existing editorial text contract", () => {
  const result = resolveBenchmarkCardData(
    "AutomationBench\nASTRA 41.4   ·   FABLE 31.4\nWINNER: ASTRA",
    { source_note: "OpenAI vendor-reported launch evaluation", benchmark_winner: "astra" },
  );
  assert.deepEqual(result, {
    name: "AutomationBench",
    source: "OpenAI vendor-reported launch evaluation",
    entries: [
      { label: "ASTRA", score: "41.4", numericScore: 41.4, winner: true },
      { label: "FABLE", score: "31.4", numericScore: 31.4, winner: false },
    ],
  });
});

test("falls back to the highest score when winner metadata is absent", () => {
  const result = resolveBenchmarkCardData("GPQA Diamond\nClaude 84.8 | OpenAI 79.7", {});
  assert.equal(result?.entries[0]?.winner, true);
  assert.equal(result?.entries[1]?.winner, false);
});

test("benchmark card rotation remains instance metadata instead of changing score parsing", () => {
  const result = resolveBenchmarkCardData(
    "AutomationBench\nASTRA 41.4 · FABLE 31.4",
    { benchmarkRotationDeg: -4 },
  );
  assert.equal(result?.name, "AutomationBench");
  assert.equal(result?.entries.length, 2);
});

#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { readEnv } from "../mcp/env-name.mjs";

const phase = process.argv[2] ?? "pre-commit";
if (readEnv("SKIP_CODE_REVIEW_HOOK") === "1") {
  console.warn("DreamCut code review hook skipped (DREAMCUT_SKIP_CODE_REVIEW_HOOK=1).");
  process.exit(0);
}

// Claude Code (Opus) reviews by default; DREAMCUT_CODE_REVIEW_TOOL=codex keeps the Codex reviewer.
const reviewer = readEnv("CODE_REVIEW_TOOL") ?? "claude";
if (!["claude", "codex"].includes(reviewer)) {
  console.error(`Unknown DREAMCUT_CODE_REVIEW_TOOL "${reviewer}"; use claude or codex.`);
  process.exit(1);
}
// Pushing from main itself would diff main against main, so the default base is what the push is going to.
const upstream = () => {
  try { return execFileSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
};
const base = readEnv("REVIEW_BASE") ?? (upstream() || "main");
const reviewModel = readEnv("CODE_REVIEW_MODEL") ?? (reviewer === "claude" ? "opus" : "gpt-5.5");
const scope = phase === "pre-push" ? `the branch's changes against ${base}` : "the staged changes this commit will contain";
// The hook gathers the diff itself, so the reviewer needs no shell: Read, Grep and Glob only.
const claudePrompt = [
  `You are the native code reviewer in a ${phase} hook (CODEX_REVIEW_CHILD=1). Review ${scope}. The diff is on stdin; read files for context.`,
  "Follow .agents/skills/code-review/SKILL.md as the native reviewer, including the public-content review in docs/standards/pr-review.md#public-content-review.",
  "Report correctness bugs and public-content problems with file:line, severity (P0-P3) and a concrete failure scenario. Say plainly when you find none.",
  "Then, under a separate Quality heading, report code-quality problems in the changed lines only: logic that duplicates an existing helper (name it), needless complexity or indirection, and code that departs from its surroundings' naming and idiom.",
  "Under a Performance heading, report changed code that will be slow in use: work repeated on every call or render that could be cached or computed once (repeated file reads, ffprobe runs, JSON parsing, network fetches), synchronous file or process work on a request or render path, sequential awaits that could run together, quadratic loops over unbounded input, React state or effects that re-render or refetch more than needed, and missing cache invalidation where a cache is added. Say what triggers it and how often.",
  "For each Quality and Performance finding give file:line and the better alternative, keep only ones worth changing, and say plainly when there are none. These are advice and do not block the commit.",
  "Read-only: do not edit files, run tests or invoke another reviewer.",
].join("\n");
const command = reviewer === "claude"
  ? ["claude", ["-p", claudePrompt, "--model", reviewModel, "--tools", "Read", "Grep", "Glob",
    "--allowedTools", "Read", "Grep", "Glob", "--permission-mode", "default"]]
  : ["codex", phase === "pre-push"
    ? ["review", "--base", base, "-c", `model="${reviewModel}"`]
    : ["review", "--uncommitted", "-c", `model="${reviewModel}"`]];

// Above this the reviewer gets the changed paths and reads the files itself, so a large commit fits its context.
const MAX_INLINE_DIFF_BYTES = 300_000;
function reviewInput(cwd, env) {
  // `git commit -a` and `git commit <paths>` hand the hook a temporary index holding what will be
  // committed; read the staged diff from it, while the reviewer itself never inherits it.
  const index = process.env.GIT_INDEX_FILE;
  const gitEnv = index ? { ...env, GIT_INDEX_FILE: path.resolve(cwd, index) } : env;
  const git = args => execFileSync("git", args, { cwd, env: gitEnv, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  // A commit reviews what is staged, so unrelated work left in the tree is not reviewed with it.
  const range = phase === "pre-push" ? [`${base}...HEAD`] : ["--cached"];
  const diff = git(["diff", ...range]);
  return Buffer.byteLength(diff) <= MAX_INLINE_DIFF_BYTES ? diff
    : `The diff is too large to include (${Buffer.byteLength(diff)} bytes). Changed files, with line counts; read the ones that matter:\n${git(["diff", "--stat=200", ...range])}`;
}

console.log(`Running native code review (${reviewer}, ${reviewModel}) before ${phase}…`);
try {
  const cwd = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const env = { ...process.env, CODEX_REVIEW_CHILD: "1" };
  // Git exports repository selectors to hooks. A review may run tests that
  // create temporary repositories; those must never inherit the real index or
  // Git directory. Resolve our checkout first, then let Git discover by cwd.
  const localVariables = execFileSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8" });
  for (const key of localVariables.trim().split(/\s+/)) delete env[key];
  let input;
  if (reviewer === "claude") {
    try { input = reviewInput(cwd, env); }
    catch (error) {
      console.error(`Could not collect the changes to review: ${String(error?.stderr || error?.message || error).trim()}`);
      console.error(phase === "pre-push" ? `Check that the review base ${base} exists locally (DREAMCUT_REVIEW_BASE).` : "Check the repository state.");
      process.exit(1);
    }
  }
  execFileSync(command[0], command[1], reviewer === "claude"
    ? { cwd, env, input, stdio: ["pipe", "inherit", "inherit"], maxBuffer: 512 * 1024 * 1024 }
    : { cwd, stdio: "inherit", env });
} catch (error) {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  console.error(`Code review did not complete${status ? ` (exit ${status})` : ""}. Commit/push stopped.`);
  console.error(`Refresh the local ${reviewer === "claude" ? "Claude Code" : "Codex"} session, or use DREAMCUT_SKIP_CODE_REVIEW_HOOK=1 for an explicit bypass.`);
  process.exit(typeof status === "number" ? status || 1 : 1);
}

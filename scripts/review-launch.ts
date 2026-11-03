import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { projectDir } from "@/lib/local-store/paths";
import { inspectWalkthroughReviewReadiness } from "@/lib/qc/walkthrough-review-readiness";

import { slotForCurrentCode, startServer } from "./stable-editor";

const root = process.cwd();
const projectId = process.argv.find((argument, index) => index > 1 && !argument.startsWith("--"));
const shouldOpen = process.argv.includes("--open");
const port = 3124;
const projectPath = projectId ? `/p/${encodeURIComponent(projectId)}` : "/";
const url = `http://127.0.0.1:${port}${projectPath}`;

async function serverIsRunning(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(750),
      redirect: "manual",
    });
    return response.status > 0;
  } catch {
    return false;
  }
}

function openUrl() {
  if (!shouldOpen) return;
  // Under Claude Code or Codex the agent opens the review in its built-in browser (agentHost in mcp/editor-runtime.mjs).
  if (process.env.CLAUDECODE || process.env.CODEX_THREAD_ID || process.env.CODEX_SANDBOX) {
    console.log("Not opening the system browser from an agent session; open the review URL in the built-in browser.");
    return;
  }
  const child = spawn("open", [url], { detached: true, stdio: "ignore" });
  child.unref();
}

async function main() {
  const selectedProjectRoot = projectId ? projectDir(projectId) : null;
  const isWalkthrough = selectedProjectRoot
    ? fs.existsSync(path.join(selectedProjectRoot, "walkthrough-ledger.md"))
    : false;
  if (shouldOpen && selectedProjectRoot && isWalkthrough) {
    const readiness = inspectWalkthroughReviewReadiness(selectedProjectRoot);
    if (!readiness.ok) {
      console.error("Human-review handoff is blocked:");
      for (const finding of readiness.findings) {
        console.error(`- ${finding.code}: ${finding.message}`);
      }
      console.error(
        "Start stable review without --open for authoring or cold grading. "
        + "The guarded opener is reserved for a hash-current independent PASS.",
      );
      process.exitCode = 1;
      return;
    }
  }

  if (await serverIsRunning()) {
    console.log("Stable review is already running. Stop it and rerun this command to load editor code changes.");
    console.log(`Stable review: ${url}`);
    openUrl();
    return;
  }

  const slot = await slotForCurrentCode(root);
  console.log(`Stable review: ${url}`);
  openUrl();
  const server = startServer(root, slot, port, "review", String(port));
  server.once("exit", (code) => process.exit(code ?? 0));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  fingerprintReviewBuild,
  isReviewBuildFresh,
  writeReviewBuildReceipt,
} from "@/lib/instruments/review-build-cache";
import { projectDir } from "@/lib/local-store/paths";
import { inspectWalkthroughReviewReadiness } from "@/lib/qc/walkthrough-review-readiness";

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

  const fingerprint = fingerprintReviewBuild(root);
  if (await serverIsRunning()) {
    if (!isReviewBuildFresh(root, fingerprint)) {
      console.warn(
        "Stable review is already running from an older source snapshot. "
        + "It is safe to keep reviewing project edits; stop that server and rerun this command to load editor code changes.",
      );
    }
    console.log(`Stable review: ${url}`);
    openUrl();
    return;
  }

  if (!isReviewBuildFresh(root, fingerprint)) {
    console.log("Stable review source changed; building an isolated review snapshot...");
    const built = spawnSync("pnpm", ["review:build"], {
      cwd: root,
      env: {
        ...process.env,
        TIMELINE_EDITOR_MODE: "review",
        TIMELINE_REVIEW_BUILD: "1",
        TIMELINE_NEXT_DIST_DIR: ".next-review",
      },
      stdio: "inherit",
    });
    if (built.status !== 0) {
      throw new Error(`Stable review build failed with exit code ${built.status ?? "unknown"}`);
    }
    writeReviewBuildReceipt(root, fingerprint);
  } else {
    console.log("Stable review source is unchanged; reusing the existing build.");
  }

  console.log(`Stable review: ${url}`);
  openUrl();
  const server = spawn("pnpm", ["review:start"], {
    cwd: root,
    env: {
      ...process.env,
      TIMELINE_EDITOR_MODE: "review",
      TIMELINE_NEXT_DIST_DIR: ".next-review",
    },
    stdio: "inherit",
  });
  server.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

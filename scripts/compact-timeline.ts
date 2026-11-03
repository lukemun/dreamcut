import {
  applyTimelineCompaction,
  buildTimelineCompactionPlan,
} from "@/lib/local-store/timeline-compaction";
import { spawnSync } from "node:child_process";

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

const projectId = process.argv[2];
if (!projectId || projectId.startsWith("--")) {
  throw new Error(
    "Usage: pnpm compact-timeline <projectId> [--apply --base http://127.0.0.1:3123 | --offline]",
  );
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function editorServerIsListening(): boolean {
  if (process.platform !== "darwin") return false;
  return [3123, 3124].some((port) =>
    spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { stdio: "ignore" }).status === 0
  );
}

async function main() {
  const plan = buildTimelineCompactionPlan(projectId);
  console.log(`Timeline compaction plan: ${projectId}`);
  console.log(
    `${plan.elements.removable} removed elements and ${plan.transitions.removable} removed transitions can leave the hot timeline.`,
  );
  console.log(
    `Projected timeline: ${formatBytes(plan.timeline_bytes_before)} → ${formatBytes(plan.timeline_bytes_projected)}`,
  );
  console.log(
    `Archived already: ${plan.elements.already_archived} elements, ${plan.transitions.already_archived} transitions.`,
  );

  if (!process.argv.includes("--apply")) {
    console.log(
      "Dry run only. Apply through a running editor with --apply --base http://127.0.0.1:3123, "
      + "or close editor servers and use --apply --offline.",
    );
  } else {
    const base = argument("base")?.replace(/\/$/, "");
    let receipt;
    if (base) {
      const parsed = new URL(base);
      if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) {
        throw new Error("--base must point to the local timeline editor");
      }
      const response = await fetch(
        `${base}/api/projects/${encodeURIComponent(projectId)}/timeline/compact`,
        { method: "POST" },
      );
      const body = await response.json() as {
        receipt?: ReturnType<typeof applyTimelineCompaction>;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? `Compaction failed with ${response.status}`);
      receipt = body.receipt ?? null;
    } else {
      if (!process.argv.includes("--offline")) {
        throw new Error("Choose --base for an online locked apply, or --offline after closing editor servers");
      }
      if (editorServerIsListening()) {
        throw new Error("An editor server is still listening on 3123 or 3124; stop it before --offline");
      }
      receipt = applyTimelineCompaction(projectId);
    }
    if (!receipt) {
      console.log("Nothing to compact.");
    } else {
      console.log(`Applied: ${formatBytes(receipt.timeline_bytes_before)} → ${formatBytes(receipt.timeline_bytes_after)}`);
      console.log(`Rollback snapshot: ${receipt.pre_compaction_snapshot_id}`);
      console.log(`Archive: ${receipt.archive_path}`);
    }
  }
}

void main();

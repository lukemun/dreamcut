/** Fast editor regression gate; no server, media downloads, AI calls, or renders. */
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const groups = {
  "Save, reload, and undo": [
    "src/lib/local-store/atomic-json.test.ts",
    "src/lib/local-store/history-snapshots.test.ts",
    "src/components/studio/timeline/useTimelineHistory.test.ts",
    "src/components/studio/timeline/external-history.test.ts",
  ],
  "Clip edits and timing": [
    "src/lib/local-store/element-patch.test.ts",
    "src/lib/local-store/split.test.ts",
    "src/lib/timeline/frame-quantization.test.ts",
    "src/lib/timeline/transitions.test.ts",
  ],
  "Captions and audio levels": [
    "src/lib/timeline/caption-timing-validation.test.ts",
    "src/lib/timeline/audio-gain.test.ts",
    "src/lib/timeline/volume-envelope.test.ts",
  ],
  "Proposal safety": [
    "mcp/proposal-gate.test.mjs",
    "src/lib/agent/proposal-staleness.test.ts",
    "src/lib/agent/timeline-editor-agent-apply.test.ts",
  ],
  "Marks, controls, and export recovery": [
    "src/lib/local-store/frame-tags.test.ts",
    "src/components/studio/timeline/playback-keyboard.test.ts",
    "src/components/studio/timeline/timeline-semantic-colors.test.ts",
    "src/lib/local-store/render-jobs.test.ts",
  ],
};

for (const [name, files] of Object.entries(groups)) {
  console.log(`${name}: ${files.length} test files`);
}
if (!process.argv.includes("--list")) {
  // Keep even accidental store/profile access away from the user's projects.
  // Individual suites may create their own additional temporary fixtures.
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "dreamcut-core-"));
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...Object.values(groups).flat()], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env,
      TIMELINE_PROJECTS_DIR: path.join(fixtureRoot, "projects"),
      DREAMCUT_PROFILE_DIR: path.join(fixtureRoot, "profile"),
    },
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}

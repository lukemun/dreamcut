import fs from "node:fs";
import path from "node:path";

import { timelineToFcpxml } from "@/lib/export/fcpxml";
import { projectDir } from "@/lib/local-store/paths";
import { readMetadata, readTimeline } from "@/lib/local-store/store";

// Interchange handoff: pnpm export-fcpxml <projectId> [--out file.fcpxml]
// Writes beside the project's media/ so the relative asset refs resolve when
// the NLE relinks. v1 limits (transitions, playback_rate) are annotated inline.

const projectId = process.argv[2];
if (!projectId) throw new Error("usage: pnpm export-fcpxml <projectId> [--out file.fcpxml]");
const outIndex = process.argv.indexOf("--out");
const output = outIndex >= 0
  ? path.resolve(process.argv[outIndex + 1]!)
  : path.join(projectDir(projectId), `${projectId}.fcpxml`);

const xml = timelineToFcpxml(readTimeline(projectId), readMetadata(projectId), projectId);
fs.writeFileSync(output, xml);
console.log(output);

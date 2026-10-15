import { runAssetJob } from "../src/lib/generation/asset-worker";

// Detached workers inherit the Next server's resolved environment.
const [projectId, id] = process.argv.slice(2);
if (!projectId || !id) throw new Error("Usage: generate-assets <project> <request-id>");
void runAssetJob(projectId, id).catch(error => { console.error(error); process.exitCode = 1; });

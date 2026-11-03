/** Upload a prepared contribution through the same contract as template_share.
 * pnpm exec tsx scripts/share-template.ts <project-id> <request.json>
 * Request action defaults are deliberately absent: choose prepare or submit explicitly.
 */
import fs from "node:fs";
import { assertProject } from "../src/lib/local-store/store";
import { agentTemplateShare } from "../src/lib/local-store/cloud-template-share";

async function main() {
  const [projectId, file] = process.argv.slice(2);
  if (!projectId || !file) throw new Error("Usage: share-template <project-id> <request.json>");
  assertProject(projectId);
  const result = await agentTemplateShare(projectId, JSON.parse(fs.readFileSync(file, "utf8")));
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

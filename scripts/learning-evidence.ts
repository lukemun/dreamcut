/** Print the learning-review evidence index for one project (read-only; no transcript text). */
import path from "node:path";
import { collectLearningEvidence } from "../src/lib/local-store/learning-evidence";

const projectId = process.argv[2];
if (!projectId || !/^[A-Za-z0-9._-]{1,128}$/.test(projectId)) {
  console.error("Usage: pnpm learning:evidence <project-id>");
  process.exit(2);
}
const projectsDir = path.resolve(process.env.TIMELINE_PROJECTS_DIR ?? "projects");
console.log(JSON.stringify(collectLearningEvidence(path.join(projectsDir, projectId)), null, 2));

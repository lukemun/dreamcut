/**
 * Reproducible demo project: `pnpm seed-demo [projectId]`
 *
 * Generates test media with ffmpeg (required on PATH) and a small timeline —
 * a title still, two video clips joined by a fade, background music, and a
 * caption — so a fresh checkout has something to open.
 */
import { projectExists } from "@/lib/local-store/paths";
import { createSampleProject } from "@/lib/local-store/sample-project";

const projectId = process.argv[2] ?? "demo";

if (projectExists(projectId)) {
  console.error(`Project "${projectId}" already exists — pick another id or delete the folder.`);
  process.exit(1);
}

console.log("Generating demo media (ffmpeg)...");
createSampleProject(projectId, "Demo Project");
console.log(`Seeded project "${projectId}" — open http://127.0.0.1:3123/p/${projectId}`);

import { runImportQueue } from "../src/lib/local-store/media-import-jobs";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: process-imports <project-id>");
runImportQueue(projectId).catch(error => { console.error(error); process.exitCode = 1; });

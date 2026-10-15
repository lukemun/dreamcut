import fs from "node:fs";
import os from "node:os";
import { prepareBrowsePreview } from "../src/lib/media-analysis/prepare-browse-preview";
import path from "node:path";
import { preparationDir, startPreparationWorker, type PreparedMedia } from "../src/lib/local-store/media-preparation";
import { prepareEditorMedia } from "../src/lib/media-analysis/prepare-editor-media";

try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* Platform may disallow priority changes. */ }
const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: prepare-media <project-id>");
const dir = preparationDir(projectId);
fs.mkdirSync(dir, { recursive: true });
const lock = path.join(dir, "worker.lock");
try {
  const pid = Number(fs.readFileSync(lock, "utf8"));
  if (pid) { try { process.kill(pid, 0); process.exit(0); } catch { fs.unlinkSync(lock); } }
  else if (Date.now() - fs.statSync(lock).mtimeMs > 30000) fs.unlinkSync(lock);
} catch {}
let handle: number;
try { handle = fs.openSync(lock, "wx"); } catch { process.exit(0); }
fs.writeFileSync(handle, String(process.pid)); fs.closeSync(handle);
try {
  for (;;) {
    const queued = fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as PreparedMedia).filter(r => r.state === "preparing");
    if (!queued.length) break;
    const awaitingPreview = queued.find(record => !record.browse_preview);
    if (awaitingPreview) {
      const preview = prepareBrowsePreview(projectId, awaitingPreview);
      if (!preview.browse_preview) console.log(JSON.stringify(prepareEditorMedia(projectId, preview)));
      continue;
    }
    // Re-read the queue after every job so newly imported previews take priority.
    console.log(JSON.stringify(prepareEditorMedia(projectId, queued[0])));
  }
} finally {
  fs.unlinkSync(lock);
  if (fs.readdirSync(dir).filter(f => f.endsWith(".json")).some(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).state === "preparing")) startPreparationWorker(projectId);
}

import fs from "node:fs";
import path from "node:path";
import { acquireCutoutLock, cutoutJobsDir, executeCutoutJob, readCutoutJob, startCutoutWorker } from "../src/lib/media-analysis/cutout-preparation";

async function main() {
const projectId=process.argv[2],dir=cutoutJobsDir(projectId);
fs.mkdirSync(dir,{recursive:true});
const release=acquireCutoutLock(path.join(dir,"worker.lock"));
if (!release) process.exit(0);
const queued=()=>fs.readdirSync(dir).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f)).map(f=>readCutoutJob(projectId,f.slice(0,-5))).filter(j=>j.state==="queued");
try {
  for (;;) {
    const jobs=queued();
    if(!jobs.length) break;
    for(const job of jobs) await executeCutoutJob(projectId,job);
  }
} finally {
  release();
  // Close the exit/enqueue race: requests after release can launch their own worker.
  if(queued().length) startCutoutWorker(projectId);
}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});

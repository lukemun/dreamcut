import fs from "node:fs";
import path from "node:path";
import {profileDir} from "../src/lib/local-store/editing-memory";
import {readNativeModelUsage} from "../src/lib/observability/native-model-usage";
import { parseArgs } from "node:util";
import { readModelUsage } from "../src/lib/observability/model-usage";

async function main() {
const { values } = parseArgs({ options: { source: {type:"string"}, json: { type: "boolean" }, provider: { type: "string" }, conversation: { type: "string" }, model: { type: "string" }, since: { type: "string" }, help: { type: "boolean" } } });
if (values.help) console.log("pnpm model-usage [--source otel|native|workers] [--json] [--conversation ID] [--model ID] [--provider ID] [--since ISO-DATE]");
else {
  if(values.source && !['otel','native','workers'].includes(values.source))throw Error('Invalid --source');
  if(values.source==='workers'){const dir=path.join(profileDir(),'worker-usage');const receipts=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'))):[];console.log(JSON.stringify({receipts,limitations:['Owned Codex/Claude workers only. Do not add to overlapping OTel or native session totals. External adapters and pre-receipt historical runs may be unavailable.']},null,2));return;}
  if(values.source==='native'){
    if(values.provider||values.model||values.since)throw Error('Native reports preserve complete reconciliation; use --conversation, then inspect per-day/model rows.');
    const report=await readNativeModelUsage(path.join(profileDir(),'agent-activity'),process.cwd(),values.conversation);
    console.log(JSON.stringify(report,null,2));return;
  }
  const report = await readModelUsage(values);
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("DreamCut — observed model usage from local OpenTelemetry logs");
    console.table(report.rows);
    console.table(report.known_tokens);
    console.log("Coverage:", report.coverage, "Files:", report.files_read);
    for (const note of report.limitations) console.log(note);
  }
}

}
void main().catch(error => { console.error(error); process.exitCode = 1; });

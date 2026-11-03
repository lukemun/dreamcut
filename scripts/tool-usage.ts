import {toolUsage} from "../src/lib/observability/tool-events";
const report=toolUsage();
if(process.argv.includes("--json"))console.log(JSON.stringify(report,null,2));
else{console.table(report.rows);console.log(`Observed unique DreamCut dispatches: ${report.observed_calls}; invalid records: ${report.invalid_records}`);report.limits.forEach(limit=>console.log(limit));}

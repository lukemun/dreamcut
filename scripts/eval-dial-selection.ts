import fs from "node:fs";
import { DIAL_SELECTION_EVAL_VERSION, dialSelectionCases, dialSelectionPacket, gradeDialSelection } from "../src/lib/agent/dial-selection-eval";

const [command, caseId, file] = process.argv.slice(2);
try {
  if (command === "list") console.log(JSON.stringify({ suite: DIAL_SELECTION_EVAL_VERSION, cases: dialSelectionCases() }, null, 2));
  else if (command === "packet" && caseId) console.log(JSON.stringify(dialSelectionPacket(caseId), null, 2));
  else if (command === "grade" && caseId && file) {
    const result = gradeDialSelection(caseId, JSON.parse(fs.readFileSync(file, "utf8")));
    console.log(JSON.stringify({ suite: DIAL_SELECTION_EVAL_VERSION, ...result }, null, 2));
    if (!result.pass) process.exitCode = 1;
  } else throw new Error("Usage: pnpm eval:dial-selection list | packet <case-id> | grade <case-id> <answer.json>");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

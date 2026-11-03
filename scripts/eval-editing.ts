import fs from "node:fs";
import { editingEvalCases, editingEvalPacket, gradeEditingProposal, EDITING_EVAL_VERSION } from "../src/lib/agent/editing-eval";

const [command, caseId, file] = process.argv.slice(2);
try {
  if (command === "list") console.log(JSON.stringify({ suite: EDITING_EVAL_VERSION, cases: editingEvalCases() }, null, 2));
  else if (command === "packet" && caseId) console.log(JSON.stringify(editingEvalPacket(caseId), null, 2));
  else if (command === "grade" && caseId && file) {
    const result = gradeEditingProposal(caseId, JSON.parse(fs.readFileSync(file, "utf8")));
    console.log(JSON.stringify({ suite: EDITING_EVAL_VERSION, kind: "proposal-component-grade", ...result }, null, 2));
    if (!result.pass) process.exitCode = 1;
  } else throw new Error("Usage: pnpm eval:editing list | packet <case-id> | grade <case-id> <proposal.json>");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

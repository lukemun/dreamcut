import {
  applyEditorAgentProposal,
  inspectEditorAgentProject,
  validateEditorAgentProposalAgainstProject,
} from "@/lib/agent/timeline-editor-agent-apply";

function valueAfter(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  const projectId = valueAfter("--project");
  if (!projectId) throw new Error("--project is required");

  if (command === "inspect") {
    const maxElements = Number(valueAfter("--max-elements") ?? 500);
    console.log(JSON.stringify(inspectEditorAgentProject(projectId, maxElements)));
    return;
  }

  if (command === "apply" || command === "validate") {
    const encoded = valueAfter("--proposal-base64");
    if (!encoded) throw new Error("--proposal-base64 is required");
    const maxMutations = Number(valueAfter("--max-mutations") ?? 0);
    const proposal = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (proposal.project_id !== projectId) throw new Error("--project does not match proposal.project_id");
    if (command === "validate") {
      console.log(JSON.stringify(validateEditorAgentProposalAgainstProject(proposal, maxMutations, projectId)));
      return;
    }
    console.log(JSON.stringify(await applyEditorAgentProposal(proposal, maxMutations)));
    return;
  }

  throw new Error("usage: timeline-editor-agent.ts inspect|validate|apply --project <id> [options]");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

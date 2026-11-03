import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  prepareCompoundPreview,
  prepareCompoundPreviewForTimeline,
  savePreparedCompoundLink,
} from "@/lib/local-store/compound-preview";
import { readTimeline } from "@/lib/local-store/store";
import {
  previewEditorAgentProposal,
  timelineRevision,
  validateEditorAgentProposalAgainstProject,
} from "@/lib/agent/timeline-editor-agent-apply";
import { readProposal, saveProposal } from "@/lib/local-store/proposals";
import { proposalElementFingerprints } from "@/lib/agent/proposal-staleness";

export const POST = withEditRequestActor(async function POST(request: Request, {params}: {params: Promise<{projectId:string}>}) {
  try {
    const {projectId} = await params;
    const input = z.object({
      element_ids:z.array(z.string().uuid()).min(2).max(32),
      label:z.string().min(1).max(120).default("Presenter compound"),
      proposal_id:z.string().regex(/^[0-9]{8}T[0-9]{6}-[a-f0-9]{8}$/).optional(),
      option_id:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).optional(),
    }).strict().superRefine((value, ctx) => {
      if (value.option_id && !value.proposal_id) ctx.addIssue({code:"custom",path:["option_id"],message:"option_id requires proposal_id"});
    }).parse(await request.json());
    if (input.proposal_id) {
      const record = readProposal(projectId, input.proposal_id);
      if (record.status !== "pending") throw new Error("Only a pending proposal can receive a preview cache");
      const preview = previewEditorAgentProposal(record.proposal, input.option_id);
      const receipt = await prepareCompoundPreviewForTimeline(projectId, preview.timeline, input.element_ids);
      const current = readProposal(projectId, input.proposal_id);
      if (current.status !== "pending" || JSON.stringify(current.proposal) !== JSON.stringify(record.proposal)) {
        throw new Error("The proposal changed during preparation. Please try again.");
      }
      savePreparedCompoundLink(projectId, record.proposal_id, preview.option.id, receipt);
      return NextResponse.json({
        proposal_id: record.proposal_id,
        option_id: preview.option.id,
        status: "ready",
        receipt,
      }, {status:201});
    }
    const revision = timelineRevision(projectId);
    const receipt = await prepareCompoundPreview(projectId,input.element_ids);
    if (timelineRevision(projectId) !== revision) throw new Error("The edit changed during preparation. Please try again.");
    const count = receipt.members.length*3;
    const proposal = validateEditorAgentProposalAgainstProject({schema_version:2,project_id:projectId,expected_revision:revision,mode:"workshop",decision:"propose",
      summary:"Combine presenter sections into one editable compound with lightweight continuous preview playback.",
      assumptions:["Original sections, voice and caption bindings remain editable; export uses the original sections.","The proxy keeps a maximum 640 px edge and never becomes render authority."],unresolved_gaps:[],
      caps:{max_mutations:count,requested_mutations:count,max_renders:0},options:[{id:"seamless-compound",label:input.label,recommended:true,summary:"One timeline container and continuous alpha preview; Break apart restores individual sections.",requested_mutations:count,
        operations:receipt.members.map(m=>({element_id:m.id,props:{compound_clip_id:receipt.id,compound_clip_label:input.label,compound_preview:receipt},rationale:"Group existing sections and use a verified lightweight continuous preview without changing speech, timing, or export sources."}))}]},count,projectId);
    const record=saveProposal(projectId,proposal,{touchedFingerprints:proposalElementFingerprints(readTimeline(projectId),proposal)});
    return NextResponse.json({proposal_id:record.proposal_id,status:record.status,receipt}, {status:201});
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Compound preparation failed"},{status:400}); }
});

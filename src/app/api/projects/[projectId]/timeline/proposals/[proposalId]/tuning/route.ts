import { NextResponse } from "next/server";
import { coverageInputError } from "@/lib/agent/proposal-coverage";
import { z } from "zod";
import { safeParseJson } from "@/lib/api-helpers";
import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { saveProposalTuning } from "@/lib/local-store/proposal-tuning";
import { proposalNumericOverridesSchema } from "@/lib/agent/proposal-overrides";
import {proposalTuningWriteSchema} from '@/lib/agent/proposal-tuning-write';
const inputSchema = z.object({ option_id: z.string().min(1), overrides: proposalNumericOverridesSchema, write:proposalTuningWriteSchema.optional() }).strict();
export const PUT = withEditRequestActor(async function PUT(request: Request, { params }: { params: Promise<{ projectId: string; proposalId: string }> }) {
  try {
    const { projectId, proposalId } = await params;
    const input = inputSchema.parse(await safeParseJson(request));
    return NextResponse.json({ tuning: await saveProposalTuning(projectId, proposalId, input.option_id, input.overrides, input.write) });
  } catch (error) {
    const coverage = coverageInputError(error);
    if (coverage) return NextResponse.json(coverage, {status: 400});
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save adjustments" },
      { status: error instanceof z.ZodError ? 400 : (error as { status?: number }).status ?? 500 });
  }
});

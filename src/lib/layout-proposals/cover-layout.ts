import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  projectLayoutProposalsDir,
  projectLayoutProposalHistoryDir,
  projectLayoutProposalPath,
} from "@/lib/local-store/paths";
import {
  assertProject,
  captureProjectHistorySnapshot,
  readJsonFile,
  recordProjectStateWrite,
  writeJsonFileAtomic,
  type ProjectMutationHistory,
} from "@/lib/local-store/store";

export const coverLayoutItemSchema = z.object({
  id: z.string().min(1).max(128),
  asset_url: z.string().min(1),
  group: z.string().min(1).max(64).optional(),
  word: z.string().min(1).max(64).optional(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  rotation: z.number().finite(),
  reveal_at: z.number().finite().nonnegative().optional(),
}).strict();

const coverLayoutAdjustmentSummarySchema = z.object({
  compared_to: z.literal("generated_items"),
  based_on_revision: z.number().int().nonnegative(),
  last_edit_source: z.enum(["user_ui", "agent", "unspecified"]),
  changed_item_count: z.number().int().nonnegative(),
  changed_item_ids: z.array(z.string().min(1).max(128)).max(500),
  changed_property_counts: z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
    rotation: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const coverLayoutProposalSchema = z.object({
  schema_version: z.literal(1),
  layout_id: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  revision: z.number().int().nonnegative(),
  updated_at: z.string(),
  canvas: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).strict(),
  generated_items: z.array(coverLayoutItemSchema).min(1).max(500),
  items: z.array(coverLayoutItemSchema).min(1).max(500),
  adjustment_summary: coverLayoutAdjustmentSummarySchema.optional(),
}).strict();

export const coverLayoutSaveSchema = z.object({
  expected_revision: z.number().int().nonnegative(),
  edit_source: z.enum(["user_ui", "agent", "unspecified"]).default("unspecified"),
  items: z.array(coverLayoutItemSchema).min(1).max(500),
}).strict();

export type CoverLayoutItem = z.infer<typeof coverLayoutItemSchema>;
export type CoverLayoutProposal = z.infer<typeof coverLayoutProposalSchema>;
export type CoverLayoutSave = z.infer<typeof coverLayoutSaveSchema>;
export type CoverLayoutProposalSummary = {
  layout_id: string;
  title: string;
  revision: number;
  updated_at: string;
  cover_count: number;
  unique_cover_count: number;
};

export function listCoverLayoutProposals(projectId: string): CoverLayoutProposalSummary[] {
  assertProject(projectId);
  const directory = projectLayoutProposalsDir(projectId);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .flatMap((entry) => {
      try {
        const proposal = coverLayoutProposalSchema.parse(
          readJsonFile<unknown>(path.join(directory, entry.name), null),
        );
        return [{
          layout_id: proposal.layout_id,
          title: proposal.title,
          revision: proposal.revision,
          updated_at: proposal.updated_at,
          cover_count: proposal.items.length,
          unique_cover_count: new Set(proposal.items.map((item) => item.asset_url)).size,
        }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

function assertSameItemSet(current: CoverLayoutProposal, nextItems: CoverLayoutItem[]) {
  const currentIds = [...current.items.map((item) => item.id)].sort();
  const nextIds = [...nextItems.map((item) => item.id)].sort();
  if (currentIds.length !== nextIds.length || currentIds.some((id, index) => id !== nextIds[index])) {
    throw Object.assign(new Error("A layout save must preserve the proposal's complete cover set."), { status: 422 });
  }
  if (new Set(nextIds).size !== nextIds.length) {
    throw Object.assign(new Error("A layout save cannot contain duplicate cover ids."), { status: 422 });
  }
}

function assertInsideCanvas(proposal: CoverLayoutProposal, items: CoverLayoutItem[]) {
  for (const item of items) {
    if (
      item.x < 0 || item.x > proposal.canvas.width
      || item.y < 0 || item.y > proposal.canvas.height
      || item.width > proposal.canvas.width
      || item.height > proposal.canvas.height
      || item.rotation < -360 || item.rotation > 360
    ) {
      throw Object.assign(new Error(`Cover ${item.id} is outside the editable canvas bounds.`), { status: 422 });
    }
  }
}

const ADJUSTABLE_PROPERTIES = ["x", "y", "width", "height", "rotation"] as const;

function summarizeAdjustments(
  proposal: CoverLayoutProposal,
  items: CoverLayoutItem[],
  editSource: CoverLayoutSave["edit_source"],
) {
  const generatedById = new Map(proposal.generated_items.map((item) => [item.id, item]));
  const changedItemIds: string[] = [];
  const changedPropertyCounts = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
  };

  for (const item of items) {
    const generated = generatedById.get(item.id);
    if (!generated) continue;
    let changed = false;
    for (const property of ADJUSTABLE_PROPERTIES) {
      if (item[property] === generated[property]) continue;
      changedPropertyCounts[property] += 1;
      changed = true;
    }
    if (changed) changedItemIds.push(item.id);
  }

  return {
    compared_to: "generated_items" as const,
    based_on_revision: proposal.revision,
    last_edit_source: editSource,
    changed_item_count: changedItemIds.length,
    changed_item_ids: changedItemIds,
    changed_property_counts: changedPropertyCounts,
  };
}

export function readCoverLayoutProposal(projectId: string, layoutId: string): CoverLayoutProposal {
  assertProject(projectId);
  const file = projectLayoutProposalPath(projectId, layoutId);
  if (!fs.existsSync(file)) {
    throw Object.assign(new Error(`Layout proposal not found: ${layoutId}`), { status: 404 });
  }
  return coverLayoutProposalSchema.parse(readJsonFile<unknown>(file, null));
}

export function saveCoverLayoutProposal(
  projectId: string,
  layoutId: string,
  raw: CoverLayoutSave,
): { proposal: CoverLayoutProposal; history: ProjectMutationHistory } {
  const payload = coverLayoutSaveSchema.parse(raw);
  const current = readCoverLayoutProposal(projectId, layoutId);
  if (payload.expected_revision !== current.revision) {
    throw Object.assign(
      new Error(`Layout changed since it was opened (expected revision ${payload.expected_revision}, current ${current.revision}). Reload before saving.`),
      { status: 409 },
    );
  }
  assertSameItemSet(current, payload.items);
  assertInsideCanvas(current, payload.items);

  // Invariant 2: a layout save is a user-visible project mutation, so it enters the
  // shared snapshot stream (with this proposal embedded) alongside its own revision
  // history below. recordProjectStateWrite keeps the external-write bridge honest.
  const before = captureProjectHistorySnapshot(projectId, "layout_proposal_save_before", {
    layoutProposalIds: [layoutId],
  });

  const historyDir = projectLayoutProposalHistoryDir(projectId, layoutId);
  fs.mkdirSync(historyDir, { recursive: true });
  writeJsonFileAtomic(path.join(historyDir, `${String(current.revision).padStart(6, "0")}.json`), current);

  const next = coverLayoutProposalSchema.parse({
    ...current,
    revision: current.revision + 1,
    updated_at: new Date().toISOString(),
    items: payload.items,
    adjustment_summary: summarizeAdjustments(current, payload.items, payload.edit_source),
  });
  writeJsonFileAtomic(projectLayoutProposalPath(projectId, layoutId), next);
  recordProjectStateWrite(projectId);
  const after = captureProjectHistorySnapshot(projectId, "layout_proposal_save", {
    layoutProposalIds: [layoutId],
  });
  return { proposal: next, history: { before, after } };
}

import { readTimeline } from "../local-store/store";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { projectTimelinePath } from "../local-store/paths";
import { clipSourceFileName } from "@/components/studio/timeline/clip-labels";
import { colorGradeSnapshot } from "../timeline/color-grade";
import { shotMatch } from "./shot-match";
import type { TimelineElement } from "@/components/studio/timeline/types";

const MAX_TARGETS = 20;

/**
 * Proposal cards that give clips the look of a reference clip, one card per clip so each applies,
 * previews and undoes on its own. `match` measures both pictures and moves the target's primaries
 * toward the reference (shot match); `same` gives the target the reference's whole grade. Builds
 * payloads only: the editor or agent saves them through the ordinary proposal route, and the
 * creator previews, tunes and applies each card.
 */
export async function lookCards(projectId: string, body: Record<string, unknown>) {
  const mode = body.mode === "same" ? "same" : "match";
  const referenceId = body.reference_element_id;
  const targetIds = Array.isArray(body.target_element_ids) ? [...new Set(body.target_element_ids.filter((id): id is string => typeof id === "string"))] : [];
  if (typeof referenceId !== "string" || !targetIds.length) throw new Error("reference_element_id and target_element_ids required");
  if (targetIds.length > MAX_TARGETS) throw new Error(`Match at most ${MAX_TARGETS} clips at once`);
  const elements = readTimeline(projectId).elements.filter((element) => !element.removed_at);
  const pick = (id: string) => {
    const element = elements.find((candidate) => candidate.id === id);
    if (!element) throw new Error(`No clip ${id} on the timeline`);
    if (element.type !== "video_clip" && element.type !== "still") throw new Error("Only video clips and pictures have a look to match");
    return element;
  };
  const reference = pick(referenceId);
  const targets = targetIds.filter((id) => id !== referenceId).map(pick);
  if (!targets.length) throw new Error("Choose a different clip to match to");
  // The same revision hash proposal_create checks (timelineRevision).
  const revision = createHash("sha256").update(fs.readFileSync(projectTimelinePath(projectId))).digest("hex");
  const proposals: Record<string, unknown>[] = [];
  const skipped: { target_element_id: string; reason: string }[] = [];
  for (const target of targets) {
    const before = colorGradeSnapshot(target.props, target.duration / 2, projectId).fields;
    let props: Record<string, unknown>;
    let measured: { distance_before: number; distance_after: number; limits: string[] } | null = null;
    if (mode === "match") {
      const result = await shotMatch(projectId, { reference_element_id: reference.id, target_element_id: target.id });
      props = result.props;
      measured = { distance_before: result.distance_before, distance_after: result.distance_after, limits: result.limits };
    } else {
      props = sameLookProps(reference, target, projectId);
    }
    if (!Object.keys(props).length) {
      skipped.push({ target_element_id: target.id, reason: mode === "match" ? "Already matches" : "Already has this look" });
      continue;
    }
    const changes = describeLookChange(before, props);
    const targetName = clipName(target), referenceName = clipName(reference);
    // The card shows its title and option label: the title names both clips, the label says what changes.
    const title = mode === "match" ? `Match “${targetName}” to “${referenceName}”` : `Give “${targetName}” the look of “${referenceName}”`;
    const label = changes.length ? capitalize(joinWords(changes)) : "Adjusts the color";
    const summary = `${label} so “${targetName}” sits with “${referenceName}”.`;
    proposals.push({
      proposal: {
        project_id: projectId,
        expected_revision: revision,
        rebase_policy: "strict",
        mode: "workshop",
        decision: "propose",
        summary: title,
        assumptions: [],
        unresolved_gaps: measured?.limits.filter((limit) => /differ|Look files/.test(limit)) ?? [],
        caps: { max_mutations: Object.keys(props).length, requested_mutations: Object.keys(props).length, max_renders: 0 },
        schema_version: 2,
        options: [{
          id: mode === "match" ? "shot-match" : "same-look",
          label,
          recommended: true,
          summary,
          // One per changed setting, as proposal_create counts them.
          requested_mutations: Object.keys(props).length,
          operations: [{ element_id: target.id, props, rationale: mode === "match" ? "Measured both pictures and moved this clip's exposure, contrast and colour toward the reference." : "Copied the reference clip's grade at its midpoint." }],
        }],
      },
      target_element_id: target.id,
      ...(measured ? { distance_before: measured.distance_before, distance_after: measured.distance_after } : {}),
    });
  }
  return { mode, reference_element_id: reference.id, proposals, skipped };
}

/** The reference's whole grade, as the props that differ from the target's. */
function sameLookProps(reference: TimelineElement, target: TimelineElement, projectId: string) {
  const from = colorGradeSnapshot(reference.props, reference.duration / 2, projectId);
  const to = colorGradeSnapshot(target.props, target.duration / 2, projectId);
  const props: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(from.fields)) {
    if (JSON.stringify(value) !== JSON.stringify(to.fields[field])) props[field] = value;
  }
  if (from.lut && (from.lut.assetId !== to.lut?.assetId || from.lut.intensity !== to.lut?.intensity)) {
    props.lut_asset_id = from.lut.assetId;
    props.lut_source_url = from.lut.sourceUrl;
    props.lut_intensity = from.lut.intensity;
  }
  return props;
}

const STOP = (value: number) => `${Number(value.toFixed(1))} stop${Math.abs(value - 1) < 0.05 ? "" : "s"}`;

/** What a creator will see change, in everyday words: "brighter by 1 stop, cooler and less colourful". */
export function describeLookChange(before: Record<string, number | number[]>, props: Record<string, unknown>): string[] {
  const words: string[] = [];
  const delta = (field: string) => typeof props[field] === "number" ? (props[field] as number) - Number(before[field] ?? 0) : 0;
  const exposure = delta("grade_exposure_ev");
  if (Math.abs(exposure) >= 0.05) words.push(`${exposure > 0 ? "brighter" : "darker"} by ${STOP(Math.abs(exposure))}`);
  const contrast = delta("grade_contrast");
  if (Math.abs(contrast) >= 0.03) words.push(contrast > 0 ? "more contrast" : "softer contrast");
  const highlights = delta("grade_highlights");
  if (Math.abs(highlights) >= 0.05) words.push(highlights > 0 ? "brighter highlights" : "gentler highlights");
  const temperature = delta("grade_temperature");
  if (Math.abs(temperature) >= 0.03) words.push(temperature > 0 ? "warmer" : "cooler");
  const tint = delta("grade_tint");
  if (Math.abs(tint) >= 0.03) words.push(tint > 0 ? "pinker" : "greener");
  const saturation = delta("grade_saturation");
  if (Math.abs(saturation) >= 0.03) words.push(saturation > 0 ? "more colourful" : "less colourful");
  const other = Object.keys(props).filter((field) => /^grade_(wheel|curve|slice)|^grade_(shadows|whites|blacks|hue_degrees|contrast_pivot)$/.test(field));
  if (other.length) words.push("its fine color adjustments");
  if (props.lut_asset_id) words.push("its look file");
  return words;
}

function clipName(element: TimelineElement) {
  const title = typeof element.props?.title === "string" && element.props.title.trim() ? element.props.title.trim() : null;
  return title ?? clipSourceFileName(element) ?? (element.type === "still" ? "picture" : "clip");
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const joinWords = (words: string[]) => words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

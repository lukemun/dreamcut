import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { deriveProposalTimeline, validateEditorAgentProposal } from "./timeline-editor-agent-apply";

// This is a proposal-component benchmark, not a production agent/tool-loop runner.
export const EDITING_EVAL_VERSION = "audio-proposals-v1";
const speech = "11111111-1111-4111-8111-111111111111";
const music = "22222222-2222-4222-8222-222222222222";
type AudioPatch = Partial<Pick<TimelineElement, "volume" | "fade_in" | "fade_out">>;
const definitions: { id: string; request: string; target: string; patch: AudioPatch; alreadyMuted?: boolean }[] = [
  { id: "mute-speech", request: "Mute the speech clip. Keep the music and all timing unchanged.", target: speech, patch: { volume: 0 } },
  { id: "lower-music", request: "Set music volume to 0.2 linear gain. Preserve speech and all timing.", target: music, patch: { volume: 0.2 } },
  { id: "music-fades", request: "Give the music a 0.5 second fade in and a 1 second fade out. Preserve its volume, speech, and all timing.", target: music, patch: { fade_in: 0.5, fade_out: 1 } },
  { id: "music-level-and-fades", request: "Set music to 0.2 linear gain with 0.5 second fade in and 1 second fade out, together in one proposal. Preserve speech and all timing.", target: music, patch: { volume: 0.2, fade_in: 0.5, fade_out: 1 } },
  { id: "already-muted", request: "Ensure speech is muted. If it is already muted, return no_change with no options. Preserve everything else.", target: speech, patch: {}, alreadyMuted: true },
];

function element(id: string, lane: string, volume: number): TimelineElement {
  return { id, project_id: "eval-audio", type: lane === "audio_music" ? "music" : "vo_segment", source_url: `/synthetic/${lane}.wav`,
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 8,
    lane_key: lane, lane_index: 0, trim_start: 0, trim_end: null, volume,
    fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false,
    removed_at: null, removed_reason: null, created_at: "2026-09-30T00:00:00.000Z", updated_at: "2026-09-30T00:00:00.000Z" };
}
function definition(id: string) {
  const value = definitions.find(item => item.id === id);
  if (!value) throw new Error(`Unknown editing eval case: ${id}`);
  return value;
}
export function editingEvalCases() { return definitions.map(({ id, request }) => ({ id, request })); }
export function editingEvalPacket(id: string) {
  const item = definition(id);
  const timeline: Parameters<typeof deriveProposalTimeline>[0] = { elements: [element(speech, "audio_speech", item.alreadyMuted ? 0 : 1), element(music, "audio_music", 0.5)], transitions: [] };
  return {
    suite: EDITING_EVAL_VERSION, case_id: id, project_id: "eval-audio",
    // Synthetic fixture revision, not a disk-backed project's revision.
    expected_revision: createHash("sha256").update(JSON.stringify(timeline)).digest("hex"),
    request: item.request, timeline,
    output_contract: {
      required: "schema_version:2, project_id:string, expected_revision:string, mode:'workshop', decision:'propose'|'no_change', summary:string, assumptions:string[], unresolved_gaps:string[], caps:{max_mutations:3,requested_mutations:number,max_renders:0}, options:Option[]",
      option: "{id:string,label:string,recommended:true,summary:string,requested_mutations:number,operations:Operation[],review_controls:Control[]}",
      operation: "{element_id:UUID,patch:{volume?:number,fade_in?:number,fade_out?:number},rationale?:string}",
      control: "{operation_index:number,target:'patch',field:'volume'|'fade_in'|'fade_out'}",
      mutation_counts: "Count fields in patches; option.requested_mutations is that count; caps.requested_mutations is the largest option count (zero for no_change).",
    },
    instructions: "Return a schema-2 proposal body for this synthetic fixture. Use max_mutations=3 and max_renders=0, mode=workshop. Only volume, fade_in and fade_out patches are supported here. Keep every unrequested field unchanged. For an edit, return one recommended option and explicit review_controls for every changed audio field. No approval, rendering, or filesystem tools. This packet supplies state; it does not test retrieval or feedback recording.",
  };
}

export function gradeEditingProposal(id: string, raw: unknown) {
  const packet = editingEvalPacket(id);
  const item = definition(id);
  const checks: Record<string, boolean> = {};
  try {
    const proposal = validateEditorAgentProposal(raw, 3);
    checks.schema = true;
    checks.identity = proposal.project_id === packet.project_id && proposal.expected_revision === packet.expected_revision;
    checks.bounds = proposal.caps.max_renders === 0;
    checks.decision = proposal.decision === (item.alreadyMuted ? "no_change" : "propose");
    checks.option_count = proposal.options.length === (item.alreadyMuted ? 0 : 1);
    if (item.alreadyMuted) {
      checks.no_mutations = proposal.caps.requested_mutations === 0 && proposal.options.length === 0;
    } else {
      const option = proposal.options[0];
      if (!option) throw new Error("Missing editable option");
      // Restrict before derivation: other production operations can access media on disk.
      const supported = option.operations.every(op => Object.entries(op).every(([key, value]) => value === undefined || ["element_id", "patch", "rationale"].includes(key))
        && op.patch && Object.keys(op.patch).length > 0
        && Object.keys(op.patch).every(key => ["volume", "fade_in", "fade_out"].includes(key)));
      checks.supported_operations = supported;
      if (!supported) throw new Error("Starter suite accepts audio patches only");
      const before = structuredClone(packet.timeline);
      const derived = deriveProposalTimeline(packet.timeline, option.operations, packet.project_id, option.preserve_fields);
      checks.fixture_unchanged = isDeepStrictEqual(packet.timeline, before);
      const expected = structuredClone(before);
      const target = expected.elements.find(el => el.id === item.target)!;
      Object.assign(target, item.patch);
      if (item.patch.volume !== undefined) {
        target.props = { ...target.props, volume_envelope: [
          { time_seconds: 0, volume: item.patch.volume },
          { time_seconds: 8, volume: item.patch.volume },
        ] };
      }
      // Production derivation updates audit timestamps; they are not editorial output.
      const normalize = (value: typeof expected) => ({ ...value, elements: value.elements.map(({ updated_at: _updated, ...el }) => el) });
      checks.outcome_and_preservation = isDeepStrictEqual(normalize(derived.timeline), normalize(expected));
      checks.controls = Object.keys(item.patch).every(field => option.operations.some((op, index) => op.element_id === item.target
        && option.review_controls?.some(ref => ref.operation_index === index && ref.target === "patch" && ref.field === field)));
    }
    return { case_id: id, pass: Object.values(checks).every(Boolean), checks, error: null };
  } catch (error) {
    return { case_id: id, pass: false, checks, error: error instanceof Error ? error.message : String(error) };
  }
}

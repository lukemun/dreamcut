import assert from "node:assert/strict";
import test from "node:test";

import type { EditorAgentOption } from "./timeline-editor-agent-apply";
import { applyProposalNumericOverrides } from "./proposal-overrides";

const option: EditorAgentOption = {
  id: "paced",
  label: "Paced",
  recommended: true,
  summary: "Tune the proposed pacing.",
  requested_mutations: 1,
  operations: [{
    element_id: "00000000-0000-4000-8000-000000000001",
    patch: { playback_rate: 1.05 },
  }],
};

test("numeric overrides tune an already-proposed field", () => {
  const tuned = applyProposalNumericOverrides(option, [{
    operation_index: 0,
    target: "patch",
    field: "playback_rate",
    value: 0.98,
  }]);
  assert.equal(tuned.operations[0]?.patch?.playback_rate, 0.98);
  assert.equal(option.operations[0]?.patch?.playback_rate, 1.05);
});

test("numeric overrides cannot introduce a new mutation", () => {
  assert.throws(() => applyProposalNumericOverrides(option, [{
    operation_index: 0,
    target: "patch",
    field: "volume",
    value: 1.2,
  }]), /already-proposed/);
});

test("numeric overrides still pass the proposal field schema", () => {
  assert.throws(() => applyProposalNumericOverrides(option, [{
    operation_index: 0,
    target: "patch",
    field: "playback_rate",
    value: 8,
  }]), /expected number to be <=4/);
});

test("numeric overrides can tune proposed audio placement without changing its source window shape", () => {
  const createOption: EditorAgentOption = {
    id: "impact",
    label: "Impact",
    recommended: true,
    summary: "Place the selected impact.",
    requested_mutations: 12,
    operations: [{
      element_id: "00000000-0000-4000-8000-000000000002",
      create_audio: {
        type: "sound_effect",
        source_url: "/api/sfx-catalog/media/impact.wav",
        timeline_start: 6.18,
        source_duration_seconds: 4.866,
        source_start_seconds: 0,
        source_end_seconds: 2.333,
        lane_key: "sound_effect_0",
        lane_index: 0,
        volume: 1.17,
        fade_in: 0,
        fade_out: 0,
        playback_rate: 1,
      },
    }],
  };
  const tuned = applyProposalNumericOverrides(createOption, [{
    operation_index: 0,
    target: "create_audio",
    field: "timeline_start",
    value: 6.2,
  }]);
  assert.equal(tuned.operations[0]?.create_audio?.timeline_start, 6.2);
  assert.equal(tuned.operations[0]?.create_audio?.source_start_seconds, 0);
  assert.equal(tuned.operations[0]?.create_audio?.source_end_seconds, 2.333);
});

test("numeric overrides tune a proposed visual effect without creating it", () => {
  const visualOption: EditorAgentOption = {
    id: "camo",
    label: "Subject-only camouflage",
    recommended: true,
    summary: "Tune the masked overlay.",
    requested_mutations: 11,
    operations: [{
      element_id: "00000000-0000-4000-8000-000000000003",
      create_visual: {
        type: "video_clip",
        source_url: "/api/projects/camo/media/cutouts/subject.webm",
        timeline_start: 13,
        source_duration_seconds: 1.8,
        source_start_seconds: 0,
        source_end_seconds: 1.8,
        lane_key: "visual_0",
        lane_index: 1,
        media_opacity: 0.9,
        has_alpha: true,
        effect_role: "active_camouflage_subject_overlay",
      },
    }],
  };
  const tuned = applyProposalNumericOverrides(visualOption, [{
    operation_index: 0,
    target: "create_visual",
    field: "media_opacity",
    value: 0.72,
  }]);
  assert.equal(tuned.operations[0]?.create_visual?.media_opacity, 0.72);
  assert.equal(visualOption.operations[0]?.create_visual?.media_opacity, 0.9);
});

test("camera blur overrides remain bounded and sample counts stay integral", () => {
  const cameraOption: EditorAgentOption = {
    id: "balanced",
    label: "Balanced",
    recommended: true,
    summary: "Tune camera blur while keeping the picture fixed.",
    requested_mutations: 2,
    operations: [{
      element_id: "00000000-0000-4000-8000-000000000001",
      props: {
        cameraRevealShutterAngle: 90,
        cameraRevealBlurSamples: 3,
      },
    }],
  };
  const tuned = applyProposalNumericOverrides(cameraOption, [{
    operation_index: 0,
    target: "props",
    field: "cameraRevealShutterAngle",
    value: 60,
  }, {
    operation_index: 0,
    target: "props",
    field: "cameraRevealBlurSamples",
    value: 2,
  }]);
  assert.equal(tuned.operations[0]?.props?.cameraRevealShutterAngle, 60);
  assert.equal(tuned.operations[0]?.props?.cameraRevealBlurSamples, 2);
  assert.throws(() => applyProposalNumericOverrides(cameraOption, [{
    operation_index: 0,
    target: "props",
    field: "cameraRevealBlurSamples",
    value: 2.5,
  }]));
});


test("color and blend overrides are bounded to proposed appearance fields", () => {
  const appearance: EditorAgentOption = { ...option, requested_mutations: 3, operations: [{
    element_id: option.operations[0]!.element_id,
    props: { recolor_color: "#c7984f", recolor_amount: 1, media_blend_mode: "difference" },
  }] };
  const tuned = applyProposalNumericOverrides(appearance, [
    { operation_index: 0, target: "props", field: "recolor_color", value: "#ffffff" },
    { operation_index: 0, target: "props", field: "recolor_amount", value: 0.35 },
    { operation_index: 0, target: "props", field: "media_blend_mode", value: "exclusion" },
  ]);
  assert.equal(tuned.operations[0]?.props?.recolor_color, "#ffffff");
  assert.equal(tuned.operations[0]?.props?.recolor_amount, 0.35);
  assert.equal(tuned.operations[0]?.props?.media_blend_mode, "exclusion");
  assert.equal(appearance.operations[0]?.props?.recolor_color, "#c7984f");
  assert.throws(() => applyProposalNumericOverrides(appearance, [{ operation_index: 0, target: "props", field: "media_blend_mode", value: "arbitrary" }]));
  assert.throws(() => applyProposalNumericOverrides(appearance, [{ operation_index: 0, target: "props", field: "recolor_color", value: 1 }]));
  const source = { ...appearance, operations: [{ element_id: option.operations[0]!.element_id, create_visual: { type: "still", source_url: "/original.png", timeline_start: 0, duration_seconds: 1, lane_key: "visual_0", lane_index: 0 } }] } as EditorAgentOption;
  assert.throws(() => applyProposalNumericOverrides(source, [{ operation_index: 0, target: "create_visual", field: "source_url", value: "/replacement.png" }]), /not an editable color or blend/);
});

test('mirror can be tuned and reset for existing and new pictures without changing source', () => {
  const mirrored = {...option,requested_mutations:1,operations:[{element_id:option.operations[0]!.element_id,props:{media_mirror:'horizontal'}}]} as EditorAgentOption;
  const reset = applyProposalNumericOverrides(mirrored,[{operation_index:0,target:'props',field:'media_mirror',value:'none'}]);
  assert.equal(reset.operations[0]?.props?.media_mirror,'none');
  assert.equal(mirrored.operations[0]?.props?.media_mirror,'horizontal');
  assert.throws(()=>applyProposalNumericOverrides(mirrored,[{operation_index:0,target:'props',field:'media_mirror',value:'bad'}]));
  const created = {...option,requested_mutations:7,operations:[{element_id:option.operations[0]!.element_id,create_visual:{type:'still',source_url:'/api/projects/fixture/media/original.png',timeline_start:0,duration_seconds:1,lane_key:'visual_0',lane_index:0,media_mirror:'horizontal'}}]} as EditorAgentOption;
  const tuned=applyProposalNumericOverrides(created,[{operation_index:0,target:'create_visual',field:'media_mirror',value:'none'}]);
  assert.equal(tuned.operations[0]?.create_visual?.source_url,'/api/projects/fixture/media/original.png');
  assert.equal(tuned.operations[0]?.create_visual?.media_mirror,'none');
});

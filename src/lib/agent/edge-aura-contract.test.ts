import assert from "node:assert/strict";
import test from "node:test";
import { editorAgentPropsSchema, editorAgentCreateVisualSchema } from "./timeline-editor-agent-apply";
const edge_aura = { model: "rg-edge-distance-v1", keyframes: [{ t: 0, inner: .1, outer: .2, color: "#7b4bc4" }, { t: 1, inner: .8, outer: 1, color: "#7b4bc4" }] };
test("the same editable aura contract works on existing rings and new visual actors", () => {
 assert.deepEqual(editorAgentPropsSchema.parse({ edge_aura }).edge_aura, edge_aura);
 const visual = editorAgentCreateVisualSchema.parse({ type: "still", source_url: "/api/projects/example/media/field.png", timeline_start: 3, duration_seconds: 2, lane_key: "ring", lane_index: 1, edge_aura });
 assert.deepEqual(visual.edge_aura, edge_aura);
 assert.equal(editorAgentPropsSchema.safeParse({ edge_aura: { ...edge_aura, keyframes: [{ ...edge_aura.keyframes[0], outer: .05 }] } }).success, false);
});

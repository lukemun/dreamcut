import assert from "node:assert/strict";
import test from "node:test";

import { overrideNotice } from "./proposal-inbox";
import type { ProposalOptionReview } from "./timeline-client";

const review = [{
  option_id: "a", label: "A", recommended: true, summary: "", requested_mutations: 2, impact: "",
  rows: [{ element_id: "clip", element_label: "Section: Thesis", element_type: "video_clip", action: "Edit clip",
    changes: [{ field: "duration", label: "Length", before: "1.5 s", after: "2 s", target: "patch", operation_index: 0, after_value: 2 }] }],
}] as unknown as ProposalOptionReview[];

test("a card that will replace the creator's change says which setting, on which clip", () => {
  assert.equal(overrideNotice([{ element_id: "clip", field: "duration" }], review),
    "You changed Length on Section: Thesis since this was drafted. Apply replaces it.");
  assert.equal(overrideNotice([{ element_id: "clip", field: "duration" }, { element_id: "clip", field: "props.media_scale" }], review),
    "You changed Length on Section: Thesis and media scale on Section: Thesis since this was drafted. Apply replaces them.");
});

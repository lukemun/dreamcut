import assert from "node:assert/strict";
import test from "node:test";

import { instantPreviewStore } from "./instant-preview-store";

test("dragged values merge per card, notify the player, and clear with the derived preview", () => {
  let notified = 0;
  const stop = instantPreviewStore.subscribe(() => { notified += 1; });
  instantPreviewStore.set("card-a", [{ elementId: "still", field: "media_offset_x", value: -0.2 }]);
  instantPreviewStore.set("card-a", [{ elementId: "still", field: "media_scale", value: 1.1 }]);
  instantPreviewStore.set("card-a", [{ elementId: "still", field: "media_offset_x", value: -0.4 }]);
  assert.deepEqual(instantPreviewStore.get(), { proposalId: "card-a", props: [
    { elementId: "still", field: "media_scale", value: 1.1 },
    { elementId: "still", field: "media_offset_x", value: -0.4 },
  ] });
  instantPreviewStore.set("card-b", [{ elementId: "other", field: "media_scale", value: 2 }]);
  assert.deepEqual(instantPreviewStore.get()?.props, [{ elementId: "other", field: "media_scale", value: 2 }]);
  instantPreviewStore.clear();
  assert.equal(instantPreviewStore.get(), null);
  assert.equal(notified, 5);
  stop();
});

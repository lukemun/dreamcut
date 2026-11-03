import assert from "node:assert/strict";
import test from "node:test";

import {
  FULL_TIMELINE_WORKSPACE_PROFILE,
  SIMPLE_TIMELINE_WORKSPACE_PROFILE,
  resolveTimelineWorkspaceProfile,
} from "./workspace-profile";

test("the local editor resolves to the full profile by default", () => {
  assert.equal(resolveTimelineWorkspaceProfile(undefined), FULL_TIMELINE_WORKSPACE_PROFILE);
  assert.ok(Object.values(FULL_TIMELINE_WORKSPACE_PROFILE.capabilities).every(Boolean));
});

test("the app profile removes workshop surfaces without creating a second timeline model", () => {
  assert.equal(resolveTimelineWorkspaceProfile("simple"), SIMPLE_TIMELINE_WORKSPACE_PROFILE);
  assert.deepEqual(SIMPLE_TIMELINE_WORKSPACE_PROFILE.capabilities, {
    proposals: false,
    reviewMarks: false,
    editorLayoutSwitcher: false,
    advancedInspector: false,
    keyframes: false,
    advancedAssetTools: false,
  });
});

export type TimelineWorkspaceProfileId = "full" | "simple";

export type TimelineWorkspaceCapabilities = Readonly<{
  proposals: boolean;
  reviewMarks: boolean;
  editorLayoutSwitcher: boolean;
  advancedInspector: boolean;
  keyframes: boolean;
  advancedAssetTools: boolean;
}>;

export type TimelineWorkspaceProfile = Readonly<{
  id: TimelineWorkspaceProfileId;
  capabilities: TimelineWorkspaceCapabilities;
}>;

export const FULL_TIMELINE_WORKSPACE_PROFILE: TimelineWorkspaceProfile = Object.freeze({
  id: "full",
  capabilities: Object.freeze({
    proposals: true,
    reviewMarks: true,
    editorLayoutSwitcher: true,
    advancedInspector: true,
    keyframes: true,
    advancedAssetTools: true,
  }),
});

export const SIMPLE_TIMELINE_WORKSPACE_PROFILE: TimelineWorkspaceProfile = Object.freeze({
  id: "simple",
  capabilities: Object.freeze({
    proposals: false,
    reviewMarks: false,
    editorLayoutSwitcher: false,
    advancedInspector: false,
    keyframes: false,
    advancedAssetTools: false,
  }),
});

export function resolveTimelineWorkspaceProfile(
  id: TimelineWorkspaceProfileId | undefined,
): TimelineWorkspaceProfile {
  return id === "simple"
    ? SIMPLE_TIMELINE_WORKSPACE_PROFILE
    : FULL_TIMELINE_WORKSPACE_PROFILE;
}

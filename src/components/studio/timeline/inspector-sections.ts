/** Stable section identities. Labels may change without changing navigation. */
export type InspectorDomain = "position" | "motion" | "color" | "mask" | "effects" | "audio" | "timing";
type SectionContext = { visual: boolean; caption: boolean; alpha: boolean; rhythm: boolean; musicTools: boolean; composition?: boolean; shape?: boolean };
type SectionRoute = { domain: InspectorDomain | ((context: SectionContext) => InspectorDomain); available?: (context: SectionContext) => boolean };
export const INSPECTOR_SECTIONS = {
  audio: { domain: "audio" },
  "music-tools": { domain: "audio", available: c => c.musicTools },
  "audio-effects": { domain: "audio" },
  stabilization: { domain: "effects", available: c => !c.caption },
  "motion-graphic": { domain: "motion", available: c => Boolean(c.composition) },
  animation: { domain: c => c.visual || c.caption ? "motion" : "audio" },
  placement: { domain: "position" },
  shape: { domain: "position", available: c => Boolean(c.shape) },
  "shape-placement": { domain: "position", available: c => Boolean(c.shape) },
  "shape-camera": { domain: "position", available: c => Boolean(c.shape) },
  "shape-fades": { domain: "motion", available: c => Boolean(c.shape) },
  camera: { domain: "position", available: c => c.visual || c.caption || Boolean(c.shape) },
  crop: { domain: "position", available: c => !c.alpha },
  perspective: { domain: "position", available: c => !c.alpha },
  surface: { domain: "position", available: c => c.visual },
  color: { domain: "color" },
  "chroma-key": { domain: "mask" },
  "background-removal": { domain: "mask" },
  "blur-reveal": { domain: "motion" },
  "effects": { domain: "effects" },
  "shape-mask": { domain: "mask" },
  timing: { domain: "timing" },
  rhythm: { domain: "audio", available: c => c.rhythm },
} satisfies Record<string, SectionRoute>;
/** Sections outside Properties have panel homes rather than inspector domains. */
export const PANEL_SECTIONS = {
  "caption-transcript": { panel: "captions" },
  "transcript-pauses": { panel: "captions" },
  "transcript-fillers": { panel: "captions" },
  "caption-word-count": { panel: "captions" },
} as const;
export type InspectorSectionId = keyof typeof INSPECTOR_SECTIONS | keyof typeof PANEL_SECTIONS;

export function visibleInspectorSections(domain: string, context: SectionContext): Set<InspectorSectionId> {
  return new Set((Object.entries(INSPECTOR_SECTIONS) as [InspectorSectionId, SectionRoute][])
    .filter(([, route]) => (typeof route.domain === "function" ? route.domain(context) : route.domain) === domain
      && (!route.available || route.available(context)))
    .map(([id]) => id));
}

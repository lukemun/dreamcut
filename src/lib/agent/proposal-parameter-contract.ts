/** Explicit migration debt, not permission for new unbound scalar parameters.
 * New creator-facing fields must enter the registry or a tested compound adapter.
 * See docs/standards/editable-parameter-contract.md.
 */
export const LEGACY_UNBOUND_NUMERIC_PARAMETERS: Record<string, string> = {
  gravity_drop_start_seconds: "Legacy animation clock; needs an anchor binding rather than an independent start.",
  letter_fall_start_seconds: "Legacy animation clock; needs an anchor binding rather than an independent start.",
  outline_width: "Legacy layered outline; differs from the registered sticker outline and needs linked geometry.",
  maxWidth: "Legacy text layout width; needs fit and position preservation coverage.",
  surfacePerspectivePx: "Legacy text surface controls need a coordinated surface adapter.",
  surfaceDepthPx: "Legacy text surface controls need a coordinated surface adapter.",
  surfaceRotateXDeg: "Legacy text surface controls need a coordinated surface adapter.",
  surfaceRotateYDeg: "Legacy text surface controls need a coordinated surface adapter.",
  surfaceRotateZDeg: "Legacy text surface controls need a coordinated surface adapter.",
  surfaceSkewXDeg: "Legacy text surface controls need a coordinated surface adapter.",
  surfaceSkewYDeg: "Legacy text surface controls need a coordinated surface adapter.",
  surfaceOpacity: "Legacy text surface controls need a coordinated surface adapter.",
  surfaceBlurPx: "Legacy text surface controls need a coordinated surface adapter.",
  benchmarkRotationDeg: "Legacy benchmark layout needs group geometry preservation.",
  inverseMaskDriftXPercent: "Legacy caption mask motion needs clock and geometry coverage.",
  inverseMaskDriftYPercent: "Legacy caption mask motion needs clock and geometry coverage.",
  inverseMaskSweepIntensity: "Legacy caption mask motion needs clock and geometry coverage.",
  inverseMaskSweepCycles: "Legacy caption mask motion needs clock and geometry coverage.",
  mediaFillSecondsPerImage: "Legacy fill schedule needs a shared clock adapter.",
  mediaFillCrossfadeSeconds: "Legacy fill schedule needs a shared clock adapter.",
  mediaFillTransitionBlur: "Legacy fill transition needs coupled duration and renderer checks.",
  mediaFillScale: "Legacy text fill framing needs source-fit coverage.",
  mediaFillPanPercent: "Legacy text fill framing needs source-fit coverage.",
  cameraRevealFontWeight: "Legacy discrete font-weight selection is not an arbitrary continuous slider.",
  cameraRevealHoldSeconds: "Legacy camera reveal needs linked phase timing.",
  cameraRevealStartDistance: "Legacy camera reveal needs coupled layout bounds.",
  cameraRevealResolveStartSeconds: "Legacy camera reveal needs linked phase timing.",
  cameraRevealResolveDurationSeconds: "Legacy camera reveal needs linked phase timing.",
};

/** New agent-writable fields that ship before their review control: the capability lands now and
 * the dial follows. Each entry says why the dial is not built yet. Proposals that change the field
 * stage normally and record it in `control_gaps` (see scripts/control-gap-report.ts); the creator can
 * still preview, approve, reject and undo it. Building the dial makes this entry stale, and the
 * contract test then requires removing it. This is not the legacy list: new fields belong here.
 */
export const PENDING_CONTROL_PARAMETERS: Record<string, string> = {};

export const STRUCTURAL_NUMERIC_PARAMETERS: Record<string, string> = {
  timeline_start: "Bound by named sequence/anchor controls; not an independent effect intensity.",
  source_duration_seconds: "Read-only source fact; changing it must not invent footage.",
  playback_ramp_source_duration_seconds: "Read-only handled-source bound for the speed compiler.",
  lane_index: "Discrete compositing structure, not a visual intensity.",
  trim_start: "Source handle; coordinate through source-window operations and source clock validation.",
  trim_end: "Source handle; coordinate through source-window operations and source clock validation.",
};

export const STRUCTURED_EFFECT_PROPOSAL_GAPS = {
  mask_inset: "Four coupled edges need a tuple adapter; never treat the array as a scalar.",
  paper_fill_color: "Legacy paper-fill color is not yet supported by proposal color overrides.",
  chroma_key_color: "Legacy key color is not yet supported by proposal color overrides.",
} as const;

/** Coupled, non-scalar transition geometry has an explicit deterministic owner. */
export const STRUCTURED_TRANSITION_PARAMETERS = {
  "params.bezier": "Four coupled easing coordinates; transitionProgress resolves the validated cubic Bézier tuple.",
} as const;

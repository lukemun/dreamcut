# DreamCut site: motion direction

Recommendation for the marketing site in `site/` (Next 16.4, React 19.3, Tailwind 4). This note gives our
interpretation. The evidence is in
[Animation libraries, component collections and motion-heavy landing pages](../research/2026-10-11-animated-landing-sites.md)
(cited below as F-numbers). Status: proposed, not implemented.

## Brand inputs

- Mark: bright blue ring (#0A84FF) around a white play triangle, wrapped by a black film strip with white
  sprocket holes ([icon](../../src/app/icon.png)).
- Taste: open space, no boxes, rules or gloss, no filler copy. Use a dark theme. The motion should carry the page.

## Decision: one engine, a shader, and a few owned components

| Layer | Choice | Why |
| --- | --- | --- |
| Engine | **Motion** (`motion`, import `motion/react`) only | MIT, React-first, scroll-linked animation runs on native ScrollTimeline where possible, layout animation uses transforms, and `reducedMotion="user"` gives a site-wide off switch (F18–F19). A single engine keeps the bundle and its mental model small. |
| Ambient backdrop | **Paper Shaders** `@paper-design/shaders-react`, pinned to an exact version | Apache-2.0 with zero dependencies. Mesh/grain gradient and god-rays fit a one-colour brand (F26). It is pre-1.0, so pin it. |
| Scroll smoothing | **None at launch** | Native scroll, sticky and anchors already work. Lenis caps Safari at 60 fps (30 in low power) and adds a dependency for little gain (F25). Revisit only if a pinned sequence feels steppy. |
| Not chosen | GSAP, three.js/R3F, Unicorn Studio | GSAP is now free (F20–F21), but it would be a second engine. Add it only if a pinned, scrubbed SplitText sequence is required (F22). R3F is heavy, and its peer range (`react <19.4`) would block React upgrades (F28). Unicorn needs a paid plan for commercial use and loads a hosted runtime (F27). |

Components (copied in through the shadcn CLI, then owned and restyled; keep each licence header):

1. **motion-primitives `text-effect`** (MIT): per-word blur/fade-in for the hero line, run once and never looped (F16).
2. **Magic UI `marquee`** (MIT, no dependencies): a film-strip row of real DreamCut cuts, with sprocket holes drawn
   in CSS. This is the logo's film strip made literal (F11).
3. **Magic UI `text-reveal`** (MIT, `motion`): one scroll-linked statement section, with words lighting from grey to white (F11).
   Linear's two-tone statement is the observed precedent (section 3, Linear).
4. **Hand-built `ReelUnspool`** (Motion `useScroll` + SVG): the blue ring unwinds into a straight timeline track
   that becomes the product UI (concept B). It is ours; no library ships it.
5. Optional **React Bits `Silk` or `Aurora`** (no dependencies) only if Paper's gradients look too clean. Note the
   Commons Clause: use on the site is fine, but we may not redistribute the component (F12, F15).

21st.dev: use it as an **idea gallery, not a source**. Its Terms limit use to “the official 21st.dev platform,” and
copies need a visible link back. The registry endpoint needs authentication, and it is not in the shadcn directory
(F04–F05). If one item is essential, take only MIT-labelled author code (F03), keep the author licence, and
rebuild it on Motion. Aceternity's licence is fine for an end product, but its registry currently reports a
degraded health status (F08–F09), so pin copied code.

## Hero concepts (ranked)

**A. Live cut (ship this first).** Full-bleed, dark, autoplaying muted loop of a real DreamCut edit: raw footage on
the left becomes the finished cut on the right as a thin #0A84FF playhead sweeps across. Cut points flash as small
blue ticks. The headline sits bottom-left in large, tight sans type and blurs in by word. There is no frame or card around the video.
This is the pattern Runway, Pika and Luma use (full-bleed muted video behind type), and it shows the product
working instead of describing it (section 3).

**B. The reel unspools (signature scroll moment, directly under A).** The logo ring sits centred and turns slowly
like a reel; its strip carries frames from the hero edit. On scroll it unwinds into a horizontal timeline track,
the play triangle becomes the playhead, and the track settles into the real editor UI. It is built with
Motion `useScroll` and `useTransform` on SVG paths and transforms only. This one moment should make the site
recognisable.

**C. Blue light (fallback if footage isn't ready).** A Paper grain gradient or god-rays in #0A84FF on black, a
centred headline, and the product window rising in with a layout transition. It is cheap and robust but generic.
Use it only as a stopgap.

Below the hero use a film-strip marquee (component 2), one text-reveal statement (component 3) and then the
product sections. Use whitespace between sections, with no dividers or boxes.

## Performance and accessibility budget

| Item | Budget / rule | Basis |
| --- | --- | --- |
| LCP | ≤ 2.5 s at p75 on mobile. The hero **poster** is the LCP element: ≤ 120 KB AVIF/WebP, in the HTML, `fetchpriority="high"` | F31 |
| Hero video | 8–12 s loop, H.264 MP4 ≤ 2.5 MB at 1080p plus a ≤ 1.2 MB 720p source for narrow screens, no audio track, `autoPlay muted loop playsInline` with `poster` | F33, F35 |
| CLS | ≤ 0.1. Every video, canvas and marquee gets fixed `aspect-ratio`. Animate `transform`/`opacity` only, never layout properties | F32 |
| JS | Animation code ≤ 60 KB gzip on the landing route. Shader and reel load as client islands after first paint, and the headline is server-rendered text | team budget |
| Shader | One canvas per page, DPR capped at 1.5, paused offscreen and when the tab is hidden | team budget |
| Reduced motion | `<MotionConfig reducedMotion="user">` at the root. The hero shows the poster plus a play button, the shader shows one frozen frame, the reel jumps to its end state, and the marquee stops | F19, F30 |
| Pause control | Any loop longer than 5 s gets a visible pause toggle (hero video, marquee) | F34 |
| Browser floor | Don't depend on CSS `animation-timeline` (Firefox only in preview). Motion `useScroll` covers it. View Transitions are progressive enhancement only | F23–F24 |
| Verification | Lighthouse mobile on the built `site/`, a WebPageTest filmstrip for LCP, and a manual pass in Safari iOS (autoplay/inline) and macOS with Reduce Motion on | — |

## Open decisions

- Which real edit to feature in A (we need cleared footage; the creator confirmed supplied audio is cleared, but the hero has no audio).
- Whether B ships in v1 or follows A. Build A, and C as a fallback, first.
- Display typeface. The observed references use tight neo-grotesques (Inter, GT Walsheim, Graphik); choosing ours is separate work.

## Sources

- [Evidence deliverable](../research/2026-10-11-animated-landing-sites.md) and
  [source records + screenshots](../research/raw/2026-10-11-animated-landing-sites/sources.md).

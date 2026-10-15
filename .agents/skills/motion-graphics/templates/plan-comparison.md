# Plan Comparison

Template `FX-MOTION-PLANS` (Properties → Templates). Two or three plan cards arrive in
turn, their prices count up, then feature ticks draw in row by row across every card. At
the end one plan is ringed and badged. Uses the shared [explainer looks](explainer-looks.md).

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Plans | Yes | Name, price and a short line each; currency and period are shared. |
| Features | Yes | Up to five, from basic to premium. Each plan includes the first N (`plan_n_includes`). |
| Highlight and badge | Optional | Default: the middle plan, "Most popular". |

## Build

`composition_id: "plans"` with [`plan-comparison/index.html`](plan-comparison/index.html),
[`plan-comparison/dreamcut.controls.json`](plan-comparison/dreamcut.controls.json) and
`looks.js`. Otherwise the steps are those of [Explainer Sequence](explainer-sequence.md#build).

## Controls

Main: Look, Heading, Plans (count), Plan 1–3 name, price, line and features (count),
Currency, Per, Decimals (None, Cents), Feature 1–5, Highlight (named after the plans),
Badge.
Timing: Cards start, Card gap, Tick gap, Hold, Entrance.

## Timing

Ticks start at Cards start + Card gap × (Plans − 1) + Entrance × 0.8 and are timed over all
five feature slots, so the highlight cue does not depend on how many features are filled.
Cues: `cards_in`, `ticks_in`, `highlight_in`.

## Limits

- Features are tiered. A plan cannot have feature 4 without features 1–3.
- Three plans at most. Wide canvases set them side by side; tall canvases stack them.

## Evidence

Demo `explainer-templates-demo` (three plans, Paper) and
`explainer-templates-demo-vertical` (two class passes in pounds, Chalk). Teaching media in
`public/recipe-previews/motion-plans/`.

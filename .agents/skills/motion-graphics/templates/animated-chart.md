# Animated Chart

Template `FX-MOTION-CHART` (Properties → Templates). Two to six bars, or a line, build up
one item at a time. Each value counts up as its bar grows or as the line reaches it. Then
the other items step back and the highlighted one stands out. Uses the shared
[explainer looks](explainer-looks.md).

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Title | Yes | Plus optional subtitle and source note. |
| Labels and values | Yes | 2–6 items, one series, values ≥ 0. |
| Unit, highlight, bars or line | Optional | Unit as text before/after (`$`, `k`, `%`). |

## Build

`composition_id: "chart"` with [`animated-chart/index.html`](animated-chart/index.html),
[`animated-chart/dreamcut.controls.json`](animated-chart/dreamcut.controls.json) and
`looks.js`. Set `bar_count` to the number of items. Otherwise the steps are those of
[Explainer Sequence](explainer-sequence.md#build).

## Controls

Main: Look, Title, Subtitle, Chart (Bars, Line), Items, Label 1–6, Value 1–6, Before values,
After values, Decimals, Highlight (options named after the labels), Values on/off, Source
note.
Timing: Chart starts, Grow time, Item gap, Hold, Entrance.

## Timing

Length = Chart starts + Grow time + Item gap × (Items − 1) + Hold. Cues: `chart_in`,
`all_landed`, `highlight_in`.

## Layout

The value axis tops out at a rounded number just above the largest value. Wide and square
canvases draw vertical bars; tall canvases draw horizontal bars with labels above. The
line chart keeps its axis on every shape.

## Limits

- One series. Values are typed on the card; nothing is read from a spreadsheet.
- Value sliders span 0–1,000 in steps of 0.5; show larger figures with the value suffix (for example 48 with "k").

## Evidence

Demo `explainer-templates-demo` (bars, Paper) and `explainer-templates-demo-vertical`
(line, Swiss, six weeks of listeners up to 2,875). Teaching media in
`public/recipe-previews/motion-chart/`.

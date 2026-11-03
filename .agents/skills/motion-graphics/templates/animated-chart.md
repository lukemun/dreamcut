# Animated Chart

Template `FX-MOTION-CHART` (Properties → Templates). Two to six bars, or a line, build up
one item at a time. Each value counts up as its bar grows or as the line reaches it. Then
the other items step back and the highlighted one stands out. Uses the shared
[explainer looks](explainer-looks.md).

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Title | Yes | Plus optional subtitle and source note. |
| Labels and values | Yes | 2–6 items, one series. Values may be negative: falls draw below a zero line. |
| Unit, highlight, bars or line | Optional | Unit as text before/after (`$`, `k`, `%`). Plus sign shows `+` on rises (market moves). |

## Build

`composition_id: "chart"` with [`animated-chart/index.html`](animated-chart/index.html),
[`animated-chart/dreamcut.controls.json`](animated-chart/dreamcut.controls.json) (DreamCut
supplies `looks.js`). Set `bar_count` to the number of items. Otherwise the steps are those of
[Explainer Sequence](explainer-sequence.md#build).

## Controls

Main: Look, Title, Subtitle, Chart (Bars, Line), Items, Label 1–6, Value 1–6, Before values,
After values, Decimals, Highlight (options named after the labels), Values on/off, Plus sign,
Source note.
Timing: Chart starts, Grow time, Item gap, Hold, Entrance.
Fixed by placement (not offered as dials): Space below, Item 1–6 starts.

## Timing

Length = Chart starts + Grow time + the last item's start + Hold, where an item starts at its
Item start (seconds after Chart starts) or the even Item gap, whichever is later. Set the item
starts from the speech alignment so each bar or point lands as the speaker names it; the line
then reaches each point at its item's start. With no item starts it builds at the even gap. Cues: `chart_in`,
`all_landed`, `highlight_in`.

## Layout

Space below (a share of the height, up to 40%) keeps the bottom clear for a presenter's corner
bubble or captions; the chart and its note move up.


The value axis runs from a rounded number just below the deepest fall (zero when nothing
falls) to a rounded number just above the largest rise. Wide and square canvases draw
vertical bars: rises stand on the zero line, falls hang from it, each value beyond its bar's
end. Tall canvases draw horizontal bars with labels above: rises grow right of zero, falls
left. The line chart keeps its axis on every shape, shades between the line and zero, and
puts a fall's value below its point.

## Limits

- One series. Values are typed on the card; nothing is read from a spreadsheet.
- Value sliders span −1,000 to 1,000 in steps of 0.5; show larger figures with the value suffix (for example 48 with "k").

## Evidence

Demo `explainer-templates-demo` (bars, Paper) and `explainer-templates-demo-vertical`
(line, Swiss, six weeks of listeners up to 2,875). Teaching media in
`public/recipe-previews/motion-chart/`.

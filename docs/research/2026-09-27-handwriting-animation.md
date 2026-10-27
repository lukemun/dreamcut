# Handwriting animation: external findings

Examined maintainer documentation and practitioner implementation READMEs on 2026-09-27. Search was scoped to SVG stroke animation, stroke fonts, and font-preserving masks. This is not an exhaustive review or a benchmark.

- DrawSVG animates SVG strokes using dash offsets; it does not animate fills. [DrawSVG documentation](https://gsap.com/docs/v3/Plugins/DrawSVGPlugin/)

- Requires stroke paths; text elements are not accepted; supports sequential length-weighted drawing. [vivus.js](https://github.com/maxwellito/vivus)

- Authored pen trajectories clipped to glyph shapes preserve filled lettering. [SVG handwriting animation](https://github.com/parttimenerd/svg-writing-animation)

- Provides stroke-font data as JSON and SVG; repository license is MIT. [Hershey Text JS](https://github.com/techninja/hersheytextjs)

- Supports creating and editing stroke fonts, including non-English fonts. [Inkscape stroke fonts](https://github.com/Shriinivas/inkscapestrokefont)

Source metadata: [records](raw/handwriting/sources.json). No finding here establishes automatic, correct pen-order recovery for every ordinary font.

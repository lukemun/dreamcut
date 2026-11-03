Hershey Script stroke data: https://github.com/techninja/hersheytextjs/blob/master/hersheytext.json (retrieved 2026-09-27), MIT license alongside this file. Printable ASCII, with authored pen lifts.

Font-preserving handwriting packs are stored in `fonts/<font-slug>/`. [Permanent Marker](fonts/permanent-marker/README.md) includes exact outlines, ordered reveal strokes, metrics, nib widths, source hash, license and audit records. Reuse a prepared pack rather than reauthoring each caption.

The other 12 editor handwriting fonts now have regular-400 saved candidates, with
85 characters each. [Coverage and review checklist](fonts/coverage-checklist.md)
links every font's receipt and playable lab. They reuse automatically through the
native Handwriting effect, but **all still need motion review**. Original contours,
advances and pair kerning are saved; contextual ligatures/alternates, other weights
and extended Unicode remain unprepared. The inspector distinguishes these saved
candidates from the existing pen-script fallback.

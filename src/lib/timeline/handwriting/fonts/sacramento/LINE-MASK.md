# Sacramento · turning line mask

Default method is available for all **85/85** prepared characters, with licensed
source contours, original spacing/pair kerning, authored cubic paths, explicit lifts
and continuous vector nibs. Exact source shapes remain masked through completion.
Native Handwriting, Drawing time and Erasing time reuse the pack automatically.
Previous saved reveal remains available in Animation → Reveal.

**Motion still needs review.** B now has a separate descending stem/lift; its ornate return and bowl direction remain provisional. Thin turns and joins need review.

[Play the alphabet project](http://127.0.0.1:3123/p/handwriting-sacramento-review) · [Review receipt](line-review.json)
· [85-character checklist](line-checklist.json). Each character has inspected fixed
partial frames plus source/final comparisons. Per-gesture midpoints are saved;
not all midpoints or continuous playback have been inspected. All final comparisons
pass 99% source coverage, with larger-size evidence for thin glyphs where needed.

Priority refinement: `B H I J P R X f g p q & @ #`.
No all-character motion acceptance is claimed.
Lowercase i uses dot first, a lift, then the stem.
B has a descending stem, a lift and a separate bowl gesture; ornate flourishes and
junction stubs remain provisional where flagged. Outline point order never supplies
writing order. Base glyphs at regular 400 do not imply ligature or alternate parity.

`line-authored-guides.json` overrides selected plans when present; otherwise
`authored-guides.json` supplies order. `line-strokes.json` stores physical cubic paths
and smooth spatial ownership regions. `line-preparation.json` records diagnostics.
The original saved-method audit/review/checklist are retained as historical evidence.

#!/usr/bin/env bash
# Vision pass over the frame-state overlays.
#
# Every question here is one a vision model is RELIABLE at: read a printed label, judge whether
# two drawn shapes overlap, name what is behind some text. The geometry it is unreliable at —
# where the caption is, how big it is, where the safe area ends — was measured deterministically
# and DRAWN ON the frame before the model ever saw it. That is the whole trick.
#
# usage: scripts/frame-vision.sh <projectId> [model] [parallelism]
set -euo pipefail

PROJECT="${1:?usage: frame-vision.sh <projectId> [model] [parallelism]}"
MODEL="${2:-gpt-5.6-terra}"
JOBS="${3:-6}"
ROOT="${TIMELINE_PROJECTS_DIR:-projects}"
DIR="$ROOT/$PROJECT/instruments/frame-state"
OUT="$DIR/vision"
mkdir -p "$OUT"

read -r -d '' PROMPT <<'EOF' || true
This is one frame of a vertical talking-head video, with measured geometry already drawn on it.

Drawn for you — do not re-derive any of it:
- A YELLOW ruler down the left edge: 20 numbered bands, band 0 at the top, each band is 5% of
  frame height. Name every vertical position by its BAND NUMBER, read off the ruler.
- The RED rectangle is the caption's exact bounding box.
- The GREEN rectangle is the platform safe area.

Answer ONLY with a JSON object, no prose, no code fence:
{
  "chin_band": <int, the band containing the BOTTOM of the speaker's chin / jawline>,
  "collar_band": <int, the band containing the top of his shirt collar; -1 if not visible>,
  "caption_overlaps_head": <true|false, does the RED box overlap ANY part of his head or face>,
  "caption_sits_on": "<one of: skin, shirt, background, mixed>",
  "caption_reads_as": "<one of: bright_white, slightly_grey, dim>",
  "lowest_clear_band": <int, the topmost band at or below which text would clear his head entirely>
}
EOF

run_one() {
  local img="$1" model="$2" out="$3" prompt="$4"
  local base
  base="$(basename "$img" .overlay.png)"
  codex exec -m "$model" -c model_reasoning_effort=medium -s read-only --skip-git-repo-check \
    -i "$img" -- "$prompt" 2>/dev/null \
    | sed -n '/{/,/}/p' > "$out/$base.json" || true
  if [ ! -s "$out/$base.json" ]; then echo "FAILED $base" >&2; else echo "ok $base"; fi
}
export -f run_one

ls "$DIR"/*.overlay.png | xargs -P "$JOBS" -I{} bash -c 'run_one "$@"' _ {} "$MODEL" "$OUT" "$PROMPT"
echo "vision output: $OUT"

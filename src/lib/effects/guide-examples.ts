import type { GuideEffect } from "./guide";
import { promotedRecipes } from "./promoted-recipes";
export const guideEffects: GuideEffect[] = [
  ...promotedRecipes,
  { skill: "layered-paper-cutout", title: "Layered Paper Cutout", credit: "DreamCut · creator-supplied portrait", description: "Colored paper layers appear on selected music hits. Opening 6.4 seconds.", video: "contour-first-half.mp4", poster: "contour-first-half.jpg", tile: { x: 0.5, y: 0.3 }, prompt: "Use the layered-paper-cutout skill with this portrait and my selected music hits. Build the colored paper layers behind me and reveal them back to front on the selected hits. Keep each layer editable.", inputs: [{ file: "input-contour-current.png", label: "Portrait used in this edit", crop: false }] },
  {
    skill: "talking-head-cutout", title: "Background removal",
    description: "Remove the background behind a person, character or object in a photo or video, keeping its whole outline and, for video, its sound in sync.",
    inputs: [], needs: ["The photo or video", "For video, the section to use", "The subject to keep, if more than one is visible"],
    useCases: ["Place a subject over a different background", "Keep hair, hands and fine edges intact as the subject moves", "Prepare a transparent cutout for a layered edit"],
    prompt: "Use the talking-head-cutout skill to remove the background from this photo or video (for video, over my selected section). Preserve all visible hair, hands, clothing and edges of the subject. For video, keep the cutout synchronized with the original sound and preserve the original recording. Leave the cutout without a white outline. Check the edges and prepare a previewable proposal before using it in my edit.",
  },
];

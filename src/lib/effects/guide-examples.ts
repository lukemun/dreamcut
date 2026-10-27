import type { GuideEffect } from "./guide";
import { promotedRecipes } from "./promoted-recipes";
export const guideEffects: GuideEffect[] = [
  ...promotedRecipes,
  { id: "FX-08", status: "partial", limitations: ["Batched pop-ins adapt the reference rather than reproducing its individual float trajectories. Reuse with new inputs has not been verified."], skill: "mask-glitch", title: "Mask Glitch · Batched Pop-ins", credit: "DreamCut · creator-supplied photos", referenceCredit: "@celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/", description: "Small birds pop in, the scene changes, then the birds flash white.", video: "pop-small-birds.mp4", poster: "pop-small-birds.jpg", prompt: "Use the mask-glitch skill, specifically its batched pop and white flash variant, with my starting and destination scenes. Pop the selected destination objects in batches, reveal the destination scene, then flash their silhouettes white. Keep each object editable.", inputs: [{ file: "input-dinosaur.jpg", label: "Starting photo · cropped", crop: true }, { file: "input-small-birds.png", label: "Next scene · small birds", crop: false }] },
  { skill: "layered-paper-cutout", title: "Layered Paper Cutout", credit: "DreamCut · creator-supplied portrait", description: "Colored paper layers appear on selected music hits. Opening 6.4 seconds.", video: "contour-first-half.mp4", poster: "contour-first-half.jpg", tile: { x: 0.5, y: 0.3 }, prompt: "Use the layered-paper-cutout skill with this portrait and my selected music hits. Build the colored paper layers behind me and reveal them back to front on the selected hits. Keep each layer editable.", inputs: [{ file: "input-contour-current.png", label: "Portrait used in this edit", crop: false }] },
  {
    id: "FX-SCRATCHPAD", status: "partial", limitations: ["The historical example changes the source pose; it demonstrates the style, not source-preserving fidelity."], skill: "scratchpad-treatment", title: "White Paper Outline",
    credit: "DreamCut recreation", referenceCredit: "Madeleine Price Ball / Wikimedia Commons, CC0 1.0",
    description: "Add a continuous white cut-paper border around a cutout, logo, card, or graphic.",
    image: "scratchpad-silhouette-after.png",
    inputs: [],
    needs: ["A cutout, logo, card, or graphic", "Your preferred outline width"],
    useCases: ["Give a cutout a white paper edge", "Match outlines across several graphics", "Fix a clipped or uneven border"],
    prompt: "Use the scratchpad-treatment skill to add a white cut-paper outline around this silhouette, with a slightly rough paper edge like the example. Wrap the entire visible perimeter, including straight crop edges and corners. Keep the artwork sharp, leave enough room so the border is not clipped, and keep the asset separately editable. Preserve the original and propose any changes to my existing edit.",
  },
  {
    skill: "talking-head-cutout", title: "Background removal",
    description: "Remove the background behind a person, character or object in a photo or video, keeping its whole outline and, for video, its sound in sync.",
    inputs: [], needs: ["The photo or video", "For video, the section to use", "The subject to keep, if more than one is visible"],
    useCases: ["Place a subject over a different background", "Keep hair, hands and fine edges intact as the subject moves", "Prepare a transparent cutout for a layered edit"],
    prompt: "Use the talking-head-cutout skill to remove the background from this photo or video (for video, over my selected section). Preserve all visible hair, hands, clothing and edges of the subject. For video, keep the cutout synchronized with the original sound and preserve the original recording. Leave the cutout without a white outline. Check the edges and prepare a previewable proposal before using it in my edit.",
  },
];

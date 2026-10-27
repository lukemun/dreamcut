import fs from "node:fs";
import path from "node:path";
import type { GuideEffect } from "./guide";

/** The motion-graphic looks, as Templates entries of kind "look". A look is what a graphic is made of
 * (colour, type, texture, the way things arrive and leave); a template is what gets built. Every look
 * works with every template listed in looks.json. */
type LookManifest = { works_with: string[]; order: string[] };
type LookEntry = { id: string; title: string; family: string; description: string };

const TEMPLATE_TITLES: Record<string, string> = {
  "explainer-sequence": "Explainer Sequence", "animated-chart": "Animated Chart", "plan-comparison": "Plan Comparison",
  "walkthrough-steps": "Walkthrough Steps", "kinetic-type": "Kinetic Type", "illustrated-explainer": "Illustrated Explainer",
};

export const lookCardId = (id: string) => `LOOK-${id.toUpperCase()}`;

export function lookGuideEffects(root = process.cwd()): GuideEffect[] {
  const dir = path.join(root, ".agents/skills/motion-graphics/looks");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "looks.json"), "utf8")) as LookManifest;
  const worksWith = manifest.works_with.map((id) => TEMPLATE_TITLES[id] ?? id);
  const looks = manifest.order.map((id) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8")) as LookEntry);
  return looks.map((look) => ({
    id: lookCardId(look.id), kind: "look", origin: "shared", implementation: "implemented",
    skill: "motion-graphics", title: look.title, description: look.description,
    family: { id: `look-${look.family.toLowerCase()}`, title: look.family, variant: look.title },
    worksWith, inputs: [],
    brings: { step: "Pick a template or a graphic in your video", request: "on my motion graphic" },
    prompt: `Use the ${look.title} look on [TEMPLATE OR MY PLACED MOTION GRAPHIC]: set its look control to "${look.id}" and keep my words, numbers and timing. With no graphic named, draw what I ask for as a new motion graphic in this look (one composition per separable object, loading the look with "looks": true), not a generated video. Follow the explainer looks in the motion-graphics skill. Propose it for me to review.`,
    limitations: ["Looks apply to the motion templates listed under Works with.", "The look is part of the rendered graphic: change it on the proposal card or in Properties → Animation → Motion graphic, then approve the new render."],
  }));
}

import fs from "node:fs";
import { isEditingRecipe } from "./placement";
import path from "node:path";
import { effectCatalogSchema } from "./recipes";
import { recipeVisuals } from "./recipe-visuals";

export type GuideEffect = {
  id?: string;
  skill: string; title: string; description: string; prompt: string;
  video?: string; tutorialVideo?: string; poster?: string; image?: string; imageAlt?: string;
  inputs: { file: string; label: string; crop: boolean }[];
  needs?: string[]; useCases?: string[];
  /** What the creator brings when it is not footage: the card's first step and the copied request's phrase. */
  brings?: { step: string; request: string };
  origin?: "user" | "shared";
  /** Shared by another DreamCut user through DreamCut Cloud, not part of the bundled catalog. */
  source?: "community";
  /** Public credit name chosen by the community recipe's author. */
  author?: string;
  /** Starting parameters a community recipe carries, as saved by its author. */
  bundles?: { skill: string; recipe_id?: string; parameters: Record<string, string | number | boolean> }[];
  family?: { id: string; title: string; variant: string };
  inputDirections?: { title: string; directions: string }[];
  preparation?: string;
  exampleKind?: "reference";
  sourceUrl?: string;
  status?: "candidate" | "partial" | "complete";
  implementation?: "implemented";
  savedRecipe?: { id: string; revision: number };
  promotedFrom?: string;
  credit?: string; referenceCredit?: string; limitations?: string[];
};

function readCatalog(root: string) {
  return effectCatalogSchema.parse(JSON.parse(fs.readFileSync(path.join(root, "docs/effects/catalog.json"), "utf8")));
}

function readProxy(id: string, sourceSha256: string, root: string) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/guide/effects/catalog/proxies.json"), "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.entries)) throw new Error("Invalid Guide proxy manifest");
  const proxy = manifest.entries.find((entry: { catalog_id: string; source_sha256: string }) => entry.catalog_id === id && entry.source_sha256 === sourceSha256);
  if (!proxy || !/^fx-[a-z0-9-]+\.mp4$/.test(proxy.file) || !/^[a-f0-9]{64}$/.test(proxy.sha256) || Math.max(proxy.width, proxy.height) > 640) throw new Error(`Prepare Guide proxy: ${id}`);
  if (proxy.poster && (!/^fx-[a-z0-9-]+-poster-f\d+\.jpg$/.test(proxy.poster.file) || !/^[a-f0-9]{64}$/.test(proxy.poster.sha256))) throw new Error(`Invalid Guide poster: ${id}`);
  return proxy as { file: string; sha256: string; poster?: { file: string; sha256: string } };
}

export function guideEffectMediaUrl(id: string) {
  return `/api/guide/effects/${encodeURIComponent(id)}/media`;
}

/** Publish recreated recipes, rather than reference-only candidates, in the Guide. */
export function recreatedGuideEffects(root = process.cwd()): GuideEffect[] {
  // These two recipes already have curated Result / Inputs / Prompt rows.
  const existing = new Set(["FX-08", "FX-SCRATCHPAD"]);
  return readCatalog(root).entries.flatMap(entry => {
    const recipe = entry.recipe;
    if (recipe.status === "candidate" || existing.has(entry.catalog_id) || !isEditingRecipe({ id: entry.catalog_id })) return [];
    const result = recipe.recreation;
    const proxy = result.kind === "video" ? readProxy(entry.catalog_id, result.sha256, root) : undefined;
    // A gallery tile shows the effect in action, so every playable example needs a chosen poster frame;
    // curated teaching media supplies its own.
    if (proxy && !proxy.poster && !recipeVisuals[entry.catalog_id]) throw new Error(`Choose a Guide poster frame: ${entry.catalog_id}`);
    const url = `${guideEffectMediaUrl(entry.catalog_id)}?v=${(proxy?.sha256 ?? result.sha256).slice(0, 16)}`;
    return [{
      id: entry.catalog_id, skill: recipe.skill, title: entry.name,
      description: entry.catalog_id === "FX-MASK-GLITCH"
        ? "Continuous white-to-color subject handoffs. Use once or across consecutive shots."
        : entry.catalog_id === "FX-WHIP-PAN"
          ? "Blend into the incoming camera turn using its real motion before the cut."
          : entry.catalog_id === "FX-NEGATIVE-POP"
            ? "Briefly invert the subject’s color, then return to the original image."
            : entry.catalog_id === "FX-SCENE-PORTAL"
              ? "Play another scene inside a tracked region, then transition into it."
              : entry.catalog_id === "FX-FILM-BURN"
                ? "Bridge two shots with a warm film-burn flare."
                : entry.catalog_id === "FX-CAMERA-FLASH"
                  ? "Flash the whole frame white at the cut between shots."
                  : entry.catalog_id === "FX-BLACKOUT"
                    ? "Join shots as the lens is covered, then uncovered."
                    : "Adapt this recreated example to your own shots.",
      ...(proxy ? { video: url, ...(proxy.poster ? { poster: `catalog/${proxy.poster.file}?v=${proxy.poster.sha256.slice(0, 16)}` } : {}) } : { image: url, imageAlt: `${entry.name}: inspected recreation frames` }),
      inputs: [], needs: recipe.inputs, preparation: recipe.preparation,
      prompt: entry.catalog_id === "FX-MASK-GLITCH"
        ? "Use the mask-glitch skill across these shots in order. Create consecutive white-to-color subject handoffs with no disappearing frames. Keep each mask editable and preview the complete sequence on the timeline. Prepare matching masks if needed and propose changes to my existing edit."
        : entry.catalog_id === "FX-WHIP-PAN"
          ? "Use the recreate-effect skill to create a Whip Pan between these shots. Blend into the developed camera-turn motion in the second clip, matching direction and using enough footage before its start for a continuous overlap. Use Blend into motion smear. Preview on the timeline and propose changes to my existing edit."
          : `Use the ${recipe.skill} skill to create ${entry.name} with my supplied assets, following the ${entry.name} effect recipe. Keep the sources and effect layers editable. Preview on the timeline and propose changes to my existing edit.`,
      status: recipe.status, credit: result.credit, referenceCredit: recipe.reference.credit, limitations: recipe.evidence.limitations,
    }];
  });
}

/** URL callers select a catalog identity, never a filesystem path. */
export function resolveGuideEffectMedia(id: string, root = process.cwd()) {
  const entry = readCatalog(root).entries.find(entry => entry.catalog_id === id);
  if (!entry || entry.recipe.status === "candidate") return null;
  const artifact = entry.recipe.recreation;
  const repository = fs.realpathSync(root);
  // Videos use the packaged playback proxy; never fall back to evidence masters.
  const file = artifact.kind === "video"
    ? fs.realpathSync(path.join(root, "public/guide/effects/catalog", readProxy(id, artifact.sha256, root).file))
    : fs.realpathSync(path.resolve(root, "docs/effects", artifact.path));
  if (!file.startsWith(repository + path.sep)) return null;
  const contentType = ({ ".mp4": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" } as Record<string, string>)[path.extname(file).toLowerCase()];
  return contentType ? { file, contentType } : null;
}

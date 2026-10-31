import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { isCatalogEntry } from './catalog-discovery';
import { recipeHasExample, recipeMediaUrl, recipeVisualFor } from '@/lib/effects/recipe-visuals';
import { listPersonalStyles } from "@/lib/local-store/personal-styles";
import { savedEffectRecipe } from "@/lib/effects/saved-effect-recipes";
import { withoutPromotedCopies } from '@/lib/effects/promoted-recipes';
import { isEditingRecipe, isGalleryRecipe } from '@/lib/effects/placement';
import { coreSkills, profileDir } from '@/lib/local-store/editing-memory';
import { userGuideEffects } from '@/lib/local-store/user-effect-recipes';
import { recreatedGuideEffects, type GuideEffect } from '@/lib/effects/guide';
import { guideEffects } from '@/lib/effects/guide-examples';
import { lookGuideEffects } from '@/lib/effects/looks';
import { sharedLooksTemplates } from '@/lib/hyperframes/look-bundle';
import { fetchCommunityRecipes } from '@/lib/effects/community-recipes';
import { effectRecipeQuickRequest, templateBrief, templateId } from '@/lib/effects/agent-request';

/** The Templates gallery, in display order: Properties → Templates, the Library's Templates tab
 * and agent template lookup all read this one list. The creator's own templates are read from the
 * profile on every call and are never copied into the repository. */
export async function galleryTemplates() {
  const skills = new Set(coreSkills().flatMap(skill => [skill.name, ...skill.aliases]));
  let personal: GuideEffect[] = [];
  let warning: string | undefined;
  // Published community recipes from DreamCut Cloud; unreachable or missing yields none, quickly.
  const community = fetchCommunityRecipes();
  try { personal = userGuideEffects(profileDir()); }
  catch { warning = 'User-only templates could not be loaded. Shared templates are still available.'; }
  try { personal.push(...listPersonalStyles().map(savedEffectRecipe)); }
  catch { warning = [warning, "Saved template settings could not be loaded."].filter(Boolean).join(" "); }
  const recreated = recreatedGuideEffects();
  // Keep the related walk-to-camera effects together even while Converge remains partial.
  const leading = guideEffects.filter(effect => effect.implementation).flatMap(effect =>
    effect.id === 'FX-FLASH-EFFECT'
      ? [effect, ...recreated.filter(recipe => recipe.id === 'FX-CLONE-CONVERGE')]
      : [effect]);
  const effects = withoutPromotedCopies([...leading, ...personal, ...recreated.filter(effect => effect.id !== 'FX-CLONE-CONVERGE'), ...guideEffects.filter(effect => !effect.implementation), ...lookGuideEffects(), ...await community])
    .filter(isCatalogEntry)
    .filter(isEditingRecipe)
    .filter(isGalleryRecipe)
    .filter(effect => effect.origin === 'user' || skills.has(effect.skill));
  const visibleTitles = new Set(effects.map(effect => effect.title));
  const shaped = await Promise.all(effects.map(async effect => {
    const previewAspect = await cardPictureAspect(effect);
    return previewAspect ? { ...effect, previewAspect } : effect;
  }));
  return { effects: shaped.map(effect => effect.worksWith ? {...effect, worksWith: effect.worksWith.filter(title => visibleTitles.has(title))} : effect), warning };
}

const pictureAspects = new Map<string, { mtimeMs: number; aspect: number | null }>();
/** Width ÷ height of the picture a card shows, so the catalog reserves each card's shape before its
 * picture loads and the grid does not jump. Read once per file from its header; null when the picture
 * is not a file the app serves from public/ (community or personal media keep their natural size). */
export async function cardPictureAspect(effect: GuideEffect): Promise<number | null> {
  const example = recipeHasExample(effect);
  const poster = recipeVisualFor(effect)?.poster ?? (effect.poster ? recipeMediaUrl(effect.poster) : undefined);
  const still = example ? effect.image ?? effect.poster : undefined;
  const url = poster ?? (still ? recipeMediaUrl(still) : undefined);
  if (!url?.startsWith("/") || url.includes("..")) return null;
  const file = path.join(process.cwd(), "public", decodeURIComponent(url.split(/[?#]/)[0]));
  try {
    const { mtimeMs } = await fs.stat(file);
    const known = pictureAspects.get(file);
    if (known?.mtimeMs === mtimeMs) return known.aspect;
    const { width, height } = await sharp(file).metadata();
    const aspect = width && height ? Math.round(width / height * 10000) / 10000 : null;
    pictureAspects.set(file, { mtimeMs, aspect });
    return aspect;
  } catch { return null; }
}

export { templateId };

/** What an agent needs to resolve a selected template, or a request naming one by its displayed title. */
export function agentTemplate(effect: GuideEffect) {
  const owner = effect.source === 'community' ? 'community' : effect.savedRecipe ? 'saved' : effect.origin === 'user' ? 'mine' : 'shared';
  return {
    id: templateId(effect), title: effect.title, owner, skill: effect.skill,
    // A look names the motion-graphics skill templates that load it (looks.json), whether or not
    // they are gallery cards; the gallery's own Works with list shows only visible cards.
    ...(effect.kind ? { kind: effect.kind, works_with: effect.kind === 'look' ? sharedLooksTemplates() : effect.worksWith } : {}),
    ...(effect.family ? { family: effect.family.title, variant: effect.family.variant } : {}),
    ...(effect.author ? { author: effect.author } : {}),
    readiness: effect.savedRecipe ? 'saved_settings' : effect.implementation ?? effect.status ?? 'example',
    description: effect.description,
    gallery_request: effectRecipeQuickRequest(effect),
    brief: templateBrief(effect),
  };
}

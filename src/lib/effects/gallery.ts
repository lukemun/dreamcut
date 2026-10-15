import { listPersonalStyles } from "@/lib/local-store/personal-styles";
import { savedEffectRecipe } from "@/lib/effects/saved-effect-recipes";
import { withoutPromotedCopies } from '@/lib/effects/promoted-recipes';
import { isEditingRecipe, isGalleryRecipe } from '@/lib/effects/placement';
import { coreSkills, profileDir } from '@/lib/local-store/editing-memory';
import { userGuideEffects } from '@/lib/local-store/user-effect-recipes';
import { recreatedGuideEffects, type GuideEffect } from '@/lib/effects/guide';
import { guideEffects } from '@/lib/effects/guide-examples';
import { fetchCommunityRecipes } from '@/lib/effects/community-recipes';
import { effectRecipeQuickRequest, templateBrief } from '@/lib/effects/agent-request';

/** The Templates gallery, in display order: Properties → Templates, the Library's Templates tab
 * and agent template lookup all read this one list. The creator's own templates are read from the
 * profile on every call and are never copied into the repository. */
export async function galleryTemplates() {
  const skills = new Set(coreSkills().map(skill => skill.name));
  let personal: GuideEffect[] = [];
  let warning: string | undefined;
  // Published community recipes from DreamCut Cloud; unreachable or missing yields none, quickly.
  const community = fetchCommunityRecipes();
  try { personal = userGuideEffects(profileDir()); }
  catch { warning = 'User-only templates could not be loaded. Shared templates are still available.'; }
  try { personal.push(...listPersonalStyles().map(savedEffectRecipe)); }
  catch { warning = [warning, "Saved template settings could not be loaded."].filter(Boolean).join(" "); }
  const effects = withoutPromotedCopies([...guideEffects.filter(effect => effect.implementation), ...personal, ...recreatedGuideEffects(), ...guideEffects.filter(effect => !effect.implementation), ...await community])
    .filter(isEditingRecipe)
    .filter(isGalleryRecipe)
    .filter(effect => effect.origin === 'user' || skills.has(effect.skill));
  return { effects, warning };
}

const slug = (value: string) => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

/** Stable lookup id for a gallery card: its recipe id, or its title for the few examples without one. */
export function templateId(effect: GuideEffect) {
  return `template:${effect.id ?? slug(effect.title)}`;
}

/** What an agent needs to resolve a copied gallery request by its displayed title. */
export function agentTemplate(effect: GuideEffect) {
  const owner = effect.source === 'community' ? 'community' : effect.savedRecipe ? 'saved' : effect.origin === 'user' ? 'mine' : 'shared';
  return {
    id: templateId(effect), title: effect.title, owner, skill: effect.skill,
    ...(effect.family ? { family: effect.family.title, variant: effect.family.variant } : {}),
    ...(effect.author ? { author: effect.author } : {}),
    readiness: effect.savedRecipe ? 'saved_settings' : effect.implementation ?? effect.status ?? 'example',
    description: effect.description,
    gallery_request: effectRecipeQuickRequest(effect),
    brief: templateBrief(effect),
  };
}

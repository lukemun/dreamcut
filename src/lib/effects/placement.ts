import type { GuideEffect } from './guide';
import { recipeHasExample } from './recipe-visuals';

/** Boundary-only studies remain documentation, not agent-recipe discovery cards. */
export const boundaryTransitionStudies = new Set(['FX-FILM-BURN', 'FX-CAMERA-FLASH', 'FX-BLACKOUT', 'FX-WHIP-PAN']);
export function isEditingRecipe(effect: Pick<GuideEffect, 'id' | 'origin'>) {
  return effect.origin === 'user' || !boundaryTransitionStudies.has(effect.id ?? '');
}
/** Shared recipes retired from the gallery; their skills still run when asked for by name. */
export const retiredGalleryRecipes = new Set(['FX-08']);
/** The gallery shows every recipe of the user's, and only shared recipes with a real example to watch. */
export function isGalleryRecipe(effect: GuideEffect) {
  if (effect.origin === 'user') return true;
  if (retiredGalleryRecipes.has(effect.id ?? '')) return false;
  return recipeHasExample(effect);
}
export function effectHome(id: string) {
  if (boundaryTransitionStudies.has(id)) return 'Properties → transition join';
  return 'Properties → Templates';
}

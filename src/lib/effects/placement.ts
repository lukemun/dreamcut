import type { GuideEffect } from './guide';
import { recipeHasExample } from './recipe-visuals';

/** The gallery shows every recipe of the user's, and only shared recipes with a real example to watch. */
export function isGalleryRecipe(effect: GuideEffect) {
  if (effect.origin === 'user') return true;
  return recipeHasExample(effect);
}

import type { PersonalStyle } from '../local-store/personal-styles';
import type { GuideEffect } from './guide';

/** Legacy saved bundles use the same recipe discovery surface, without claiming a
 * verified recreation or changing their immutable proposal references. */
export function savedEffectRecipe(style: PersonalStyle): GuideEffect {
  return {
    id: `saved-${style.id}`, origin: 'user', skill: style.bundles[0]!.skill,
    savedRecipe: { id: style.id, revision: style.revision },
    title: style.name, description: style.description || 'A template with your saved settings.',
    inputs: [], needs: ['Your source footage or images and the target moment in the edit.'],
    preparation: `Read the saved settings and the ${style.bundles.map(bundle => bundle.skill).join(', ')} guidance. Adapt source preparation and timing to the supplied footage while keeping the saved settings editable.`,
    prompt: `Read personal_style_get with id ${style.id}. Verify revision ${style.revision} and preserve its bundle parameters. Prepare an editable proposal with personal_style: {id: "${style.id}", revision: ${style.revision}}. Explain unsupported parameters; do not apply or approve the proposal.`,
    limitations: ['Saved settings are preserved; applying this template to new footage still requires preparation and review. No verified demonstration is attached.'],
  };
}

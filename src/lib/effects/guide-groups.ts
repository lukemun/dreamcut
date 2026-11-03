import type { GuideEffect } from "./guide";

export type GuideEffectGroup = {
  key: string;
  title?: string;
  effects: GuideEffect[];
};

/** Keep variants together after origin and search filters have been applied. */
export function groupGuideEffects(effects: GuideEffect[]): GuideEffectGroup[] {
  const groups: GuideEffectGroup[] = [];
  const families = new Map<string, GuideEffectGroup>();
  for (const effect of effects) {
    if (!effect.family) {
      groups.push({ key: effect.id ?? effect.skill, effects: [effect] });
      continue;
    }
    const key = `${effect.origin ?? "shared"}:${effect.family.id}`;
    let group = families.get(key);
    if (!group) {
      group = { key, title: effect.family.title, effects: [] };
      families.set(key, group);
      groups.push(group);
    }
    group.effects.push(effect);
  }
  return groups;
}

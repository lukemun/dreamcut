import type { GuideEffect } from '@/lib/effects/guide';
import { effectRecipeQuickRequest } from '@/lib/effects/agent-request';
export function effectAgentRequest(projectId: string, effect: GuideEffect, target?: { id: string; label?: string }) {
  // One plain sentence naming the template; the agent works in the open project. A picked clip follows it.
  return [
    effectRecipeQuickRequest(effect),
    target ? `Target clip: ${JSON.stringify(target.label ?? target.id)} (element ID: ${target.id}). Keep this target unless I explicitly change it.` : '',
  ].filter(Boolean).join('\n');
}

'use client';
import { useEffect, useState } from 'react';
import { PersonalStyles } from './PersonalStyles';
import { TemplateShare } from './TemplateShare';
import { TemplateCatalog } from './TemplateCatalog';
import { effectAgentRequest } from "./library-effect-catalog";
import type { GuideEffect } from '@/lib/effects/guide';

/** `onWatchExample` plays a template's example full size in the editor preview, when the host has one. */
export function LibraryEffectCatalog({ projectId, active, onWatchExample }: { projectId: string; active: boolean; onWatchExample?: (example: { title: string; video: string; poster?: string }) => void }) {
  const [recipeRevision, setRecipeRevision] = useState(0);
  const [effects, setEffects] = useState<GuideEffect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/guide/effects', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load templates.');
      const data = await response.json(); setEffects(data.effects); setWarning(data.warning ?? '');
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason.message)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [recipeRevision]);
  return <TemplateCatalog layout="panel" effects={effects} active={active} loading={loading} error={error} warning={warning}
    requestFor={effect => effectAgentRequest(projectId, effect)} onWatchExample={onWatchExample}
    detailExtras={(selected, { close }) => <>
      {selected.savedRecipe && <PersonalStyles projectId={projectId} recipeId={selected.savedRecipe.id} onSaved={() => { setRecipeRevision(n => n + 1); close(); }} />}
      {selected.origin === 'user' && selected.id && /^(saved|user)-/.test(selected.id) && <TemplateShare key={`share-${selected.id}`} projectId={projectId} templateId={selected.id} />}
    </>} />;
}

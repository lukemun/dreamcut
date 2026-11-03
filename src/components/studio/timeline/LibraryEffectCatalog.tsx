'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { PersonalStyles } from './PersonalStyles';
import { TemplateShare } from './TemplateShare';
import { TemplateCatalog } from './TemplateCatalog';
import type { GuideEffect } from '@/lib/effects/guide';

/** `onWatchExample` plays a template's example full size in the editor preview, when the host has one.
 * `toolbarAction` sits beside the All / Yours / Shared filter; `kindAction` beside Effects / Looks (Wide's Expand). */
export function LibraryEffectCatalog({ projectId, active, onWatchExample, toolbarAction, kindAction, detailAction }: { projectId: string; active: boolean; onWatchExample?: (example: { title: string; video: string; poster?: string }) => void; toolbarAction?: ReactNode; kindAction?: ReactNode;
  /** A host action in a template's details (Storyboard's Add to canvas). */ detailAction?: (effect: GuideEffect) => ReactNode }) {
  const [recipeRevision, setRecipeRevision] = useState(0);
  const [effects, setEffects] = useState<GuideEffect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    // A busy editor server (a rebuild, a long preview) can hold a request for minutes; each try gives
    // up after 15 s and asks again, so the panel recovers instead of loading forever.
    const load = async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          const response = await fetch('/api/guide/effects', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
          if (!response.ok) throw new Error('Could not load templates.');
          const data = await response.json(); setEffects(data.effects); setWarning(data.warning ?? ''); setError('');
          return;
        } catch (reason) {
          if (controller.signal.aborted) return;
          if (attempt >= 4) { setError(reason instanceof Error && reason.name !== 'TimeoutError' ? reason.message : 'Could not load templates.'); return; }
        }
      }
    };
    void load().finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [recipeRevision]);
  return <TemplateCatalog layout="panel" effects={effects} active={active} loading={loading} error={error} warning={warning} onWatchExample={onWatchExample} toolbarAction={toolbarAction} kindAction={kindAction}
    detailExtras={(selected, { close }) => <>
      {detailAction?.(selected)}
      {selected.savedRecipe && <PersonalStyles projectId={projectId} recipeId={selected.savedRecipe.id} onSaved={() => { setRecipeRevision(n => n + 1); close(); }} />}
      {selected.origin === 'user' && selected.id && /^(saved|user)-/.test(selected.id) && <TemplateShare key={`share-${selected.id}`} projectId={projectId} templateId={selected.id} />}
    </>} />;
}

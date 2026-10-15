
'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Copies a request only; never submits an edit or generation. */
export function EffectAgentRequest({ request, focus = false }: { request: string; focus?: boolean; compact?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focus) root.current?.focus({ preventScroll: false }); }, [focus]);
  const [status, setStatus] = useState<'ready' | 'copied' | 'failed'>('ready');
  return <div ref={root} tabIndex={-1} className="grid min-w-0 justify-items-start gap-2 text-sm leading-relaxed" aria-label="Request to paste into chat">
    <p className="m-0 select-text text-[var(--ink-secondary)]">{request}</p>
    <Button variant="outline" size="sm" onClick={async () => {
      try { await navigator.clipboard.writeText(request); setStatus('copied'); }
      catch { setStatus('failed'); }
    }}>{status === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{status === 'copied' ? 'Request copied' : 'Copy request'}</Button>
    {status === 'failed' ? <p role="status" className="m-0 text-sm text-[var(--ink-muted)]">Copy failed — select the text above.</p> : null}
  </div>;
}

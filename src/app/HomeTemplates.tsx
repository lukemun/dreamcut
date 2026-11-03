"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileUp, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuideEffects } from "@/components/studio/timeline/GuideEffects";
import { recipeHasExample } from "@/lib/effects/recipe-visuals";
import type { GuideEffect } from "@/lib/effects/guide";
import { templateSelection } from "@/lib/effects/agent-request";
import { useAgentSelection } from "@/components/desktop/ProjectReviewDock";
import type { TemplateDraft } from "@/lib/local-store/template-drafts";

/** How many templates the home page shows before View all. */
const SHOWCASE = 6;
const STAGE: Record<TemplateDraft["stage"], string> = { new: "Draft", requested: "Waiting for your agent" };

/**
 * Home's top section, for inspiration: a few templates with examples, any of the creator's
 * drafts first, and a way to make a template from a video (button, or drop a file anywhere here).
 */
export function HomeTemplates({ drafts, allHref, onDetailChange }: { drafts: TemplateDraft[]; allHref: string; onDetailChange?: (open: boolean) => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [effects, setEffects] = useState<GuideEffect[] | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/guide/effects", { signal: controller.signal }).then(response => response.ok ? response.json() : { effects: [] })
      .then((data: { effects: GuideEffect[] }) => setEffects(data.effects.filter(effect => effect.kind === 'look' && recipeHasExample(effect)).slice(0, SHOWCASE)))
      .catch(() => { if (!controller.signal.aborted) setEffects([]); });
    return () => controller.abort();
  }, []);
  const intake = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || busy) return;
    setError(""); setBusy(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/template-drafts", { method: "POST", body: form });
      const body = await response.json() as { draft?: TemplateDraft; error?: string };
      if (!response.ok || !body.draft) throw new Error(body.error ?? "Could not add that video.");
      router.push(`/templates/drafts/${body.draft.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not add that video."); setBusy(""); }
  };
  return <section className="home-section home-templates dashboard-collection" data-over={over || undefined} aria-labelledby="home-templates-title"
    onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setOver(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false); }}
    onDrop={event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); setOver(false); void intake(event.dataTransfer.files); }}>
    <div className="home-section-header">
      <h2 id="home-templates-title" className="projects-group-label">Looks</h2>
      <div className="home-section-actions">
        {busy ? <span role="status">Adding {busy}…</span>
          : <Button size="sm" variant="ghost" onClick={() => input.current?.click()}><FileUp size={14} aria-hidden="true" />Make one from a video</Button>}
        <Link className="dashboard-view-all" href={allHref}>Browse templates & looks</Link>
      </div>
      <input ref={input} type="file" hidden accept="video/mp4,video/quicktime,video/webm,.m4v" aria-label="Choose a video" onChange={event => { void intake(event.target.files); event.target.value = ""; }} />
    </div>
    {error && <p role="alert" className="home-template-error">{error}</p>}
    {drafts.length > 0 && <ul className="projects-grid home-draft-grid" aria-label="Drafts">{drafts.map(draft => <li key={draft.id}>
      <Link href={`/templates/drafts/${draft.id}`} className="projects-card">
        <div className="projects-card-art"><video src={`/api/template-drafts/${draft.id}/media#t=${draft.mark?.start ?? 0.5}`} preload="metadata" muted playsInline aria-hidden="true" /></div>
        <div className="projects-card-heading"><span className="projects-card-title" title={draft.title}>{draft.title}</span><span className="text-xs text-[var(--color-text-secondary)]">{STAGE[draft.stage]}</span></div>
      </Link>
    </li>)}</ul>}
    {/* Clicking a card selects it into Home's chat box; Details opens it. */}
    {effects === null ? <div className="home-templates-loading" aria-busy="true" /> : <GuideEffects effects={effects} browse={false} onDetailChange={onDetailChange} />}
  </section>;
}

/** Templates page: an open template's Use this puts it in Home's chat box and returns there. */
export function TemplatesCatalog({ effects, warning, homeHref }: { effects: GuideEffect[]; warning?: string; homeHref: string }) {
  const router = useRouter();
  const selection = useAgentSelection();
  return <GuideEffects discovery effects={effects} warning={warning} startAction={selection ? effect => <Button size="sm" onClick={() => {
    const pick = templateSelection(effect);
    if (!selection.selections.some(item => item.id === pick.id)) selection.toggleSelection({ ...pick, group: "templates" });
    router.push(homeHref);
  }}><MessageSquarePlus size={14} aria-hidden="true" />{effect.kind === "look" ? "Use this look" : "Use this template"}</Button> : undefined} />;
}

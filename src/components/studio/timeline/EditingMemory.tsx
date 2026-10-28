"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageHeader } from "@/components/ui/page-header";
import { UserSkills } from "./UserSkills";
import { PreviewQualitySettings } from "./PreviewQualitySettings";
import { EditorAppearanceSettings } from "@/app/EditorAppearance";
import { KeyboardShortcutSettings } from "./KeyboardShortcutSettings";
import { StyleDocumentEditor } from "./StyleDocumentEditor";
import { CloudAccountBadge, CloudAccountSettings } from "./CloudAccountSettings";
import { CloudStyleSuggestions } from "./CloudStyleSuggestions";
import { refreshCloudSentry } from "@/lib/observability/cloud-sentry-client";
import { StyleMembershipPrompt } from "./MembershipPrompt";
import { ProjectHistory } from "./ProjectHistory";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import styles from "./EditingMemory.module.css";

import type { MemoryPage, EditingPreference } from "@/lib/local-store/editing-memory";
import { OptionSelect } from "@/components/ui/select";

type View = MemoryPage;
// Mirrors MEMORY_CHAPTER_PAGE_SIZE without importing the server-only module into the client bundle.
const MEMORY_CHAPTER_PAGE_SIZE = 50;
type UserTab = "My style" | "Skills" | "Settings";

const preferenceCategories = ["Pacing", "Captions", "Visuals", "Audio", "Delivery", "Workflow"] as const;
const tabs: UserTab[] = ["My style", "Skills", "Settings"];
const tabKeys = { "My style": "style", Skills: "skills", Settings: "settings" } as const;

export function EditingMemoryPage({ projectId, projectTitle, history = false, dashboard = false }: { projectId: string; projectTitle: string; history?: boolean; dashboard?: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = tabs.find(name => tabKeys[name] === searchParams.get("tab")) ?? "My style";
  const styleDirty = useRef(false);
  const setStyleDirty = useCallback((dirty: boolean) => {styleDirty.current = dirty;}, []);
  const tabHref = (name: UserTab) => dashboard ? `/?view=user&project=${encodeURIComponent(projectId)}&tab=${tabKeys[name]}` : `/p/${projectId}/user?tab=${tabKeys[name]}`;
  function setTab(name: UserTab) { if (styleDirty.current && !window.confirm("Discard unsaved style changes?")) return; router.replace(tabHref(name), { scroll: false }); }
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [category, setCategory] = useState<EditingPreference["category"]>("Captions");
  const [chapterLimit, setChapterLimit] = useState(MEMORY_CHAPTER_PAGE_SIZE);
  const version = useRef<{ query: string; etag: string } | null>(null);
  const url = `/api/projects/${projectId}/memory`;
  const query = history
    ? `view=page&section=history&chapters_limit=${chapterLimit}`
    : "view=page&section=user";

  const refresh = useCallback(async () => {
    try {
      const etag = version.current?.query === query ? version.current.etag : null;
      const response = await fetch(`${url}?${query}`, { cache: "no-store", headers: etag ? { "If-None-Match": etag } : {} });
      if (response.status === 304) return;
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const nextEtag = response.headers.get("ETag");
      version.current = nextEtag ? { query, etag: nextEtag } : null;
      setView(data);
      setError("");
    } catch (nextError) {
      setError(String(nextError));
    }
  }, [url, query]);

  useEffect(() => {
    void refresh();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };
    const timer = window.setInterval(tick, 5_000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  async function change(body: unknown) {
    setBusy(true);
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await refresh();
      return true;
    } catch (nextError) {
      setError(String(nextError));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function preference(item: EditingPreference, status: EditingPreference["status"]) {
    return change({ action: "preference", id: item.id, text: item.text, category: item.category, scope: item.scope, status });
  }

  const userView = view?.section === "user" ? view : null;
  const historyView = view?.section === "history" ? view : null;
  const personalPreferences = view?.profile.preferences.filter(item => item.scope !== "project" || item.project_id === projectId) ?? [];
  const renderPreference = (item: EditingPreference) => <article className={styles.preference} key={item.id}>
    <p>{item.text}</p>
    <div className={styles.preferenceMeta}>
      <span>{item.scope === "all" ? "All my edits" : item.scope === "project" ? `${projectTitle} only` : "Vertical videos"}</span>
      <details><summary>Details</summary><p>{item.origin === "human" ? "Saved from your direction" : "Learned from your edits"}</p>{item.evidence.map(evidence => <div className={styles.evidence} key={evidence}>{evidence}</div>)}</details>
      <button disabled={busy} onClick={() => void preference(item, item.status === "active" ? "retired" : "active")}>{item.status === "active" ? "Disable" : "Use preference"}</button>
    </div>
  </article>;

  return <section className={`editor-chrome memory-page ${styles.page}`} aria-labelledby="editing-memory-title">
    <PageHeader id="editing-memory-title" icon={history ? undefined : <UserRound size={19} />}
      back={history ? { href: `/p/${projectId}`, label: "Back to editor" } : undefined}
      title={history ? "Project history" : "User"}
      subtitle={history ? <p>{projectTitle}</p> : <CloudAccountBadge action={tab !== "Settings" && tab !== "My style" /* both tabs have their own Sign in */} />}>
      {!history && <SegmentedControl className={styles.tabs} aria-label="User sections" role="tablist">
        {tabs.map((name, index) => <button key={name} id={`user-tab-${index}`} type="button" role="tab" aria-controls="memory-panel" tabIndex={tab === name ? 0 : -1} aria-selected={tab === name} onClick={() => setTab(name)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); setTab(tabs[next]!);
          document.getElementById(`user-tab-${next}`)?.focus();
        }}>{name}</button>)}
      </SegmentedControl>}
    </PageHeader>

    <div id="memory-panel" className="memory-body memory-page-body" role={history ? "region" : "tabpanel"} aria-labelledby={history ? "editing-memory-title" : `user-tab-${tabs.indexOf(tab)}`} tabIndex={0} key={tab}>
      {error && <p role="alert">{error}</p>}
      {!view && !error && <p>Loading…</p>}
      {userView && tab === "My style" && <div className="memory-page-column">
        <div className="memory-section-intro"><h2>My style</h2></div>
        <StyleDocumentEditor document={userView.style_document} busy={busy} onDirty={setStyleDirty} save={(markdown, revision) => change({action: "style_document", markdown, expected_revision: revision})} />
        <StyleMembershipPrompt />
        <CloudStyleSuggestions settingsHref={tabHref("Settings")} onStyleChanged={() => void refresh()} />
        {personalPreferences.some(item => item.status === "active" && item.scope === "project") && <section className="memory-card"><h3>{projectTitle} only</h3>{personalPreferences.filter(item => item.status === "active" && item.scope === "project").map(renderPreference)}</section>}
        {(["suggested", "retired"] as const).map(status => {
          const items = personalPreferences.filter(item => item.status === status);
          return items.length ? <details className="memory-card" key={status}><summary>{status === "suggested" ? "Suggestions to review" : "Disabled preferences"} · {items.length}</summary>{items.map(renderPreference)}</details> : null;
        })}
        <details className="memory-card"><summary>Add a project exception</summary>
        <form className="memory-card" onSubmit={event => {
          event.preventDefault();
          void change({ action: "preference", text, category, scope: "project", status: "active" }).then(ok => { if (ok) setText(""); });
        }}>
          <label>Direction for {projectTitle}<textarea required maxLength={1000} value={text} onChange={event => setText(event.target.value)} placeholder="Keep captions on one line with 3–4 words." /></label>
          <div className="memory-row">
            <OptionSelect label="Preference category" value={category} onValueChange={next => setCategory(next as typeof category)} options={preferenceCategories.map(value => ({ value, label: value }))} />
            <button disabled={busy || !text.trim()}>Save preference</button>
          </div>
        </form>
        </details>

      </div>}


      {historyView && <ProjectHistory projectId={projectId} view={historyView}
        onShowEarlier={() => setChapterLimit(limit => limit + MEMORY_CHAPTER_PAGE_SIZE)} />}

      {userView && tab === "Settings" && <div className="memory-page-column flex flex-col gap-4">
        <CloudAccountSettings />
        <section className="space-y-5 rounded-xl bg-[var(--chrome-panel)] p-6" aria-labelledby="computer-settings-title">
          <h2 id="computer-settings-title" className="text-lg font-semibold">Settings for this computer</h2>
          <EditorAppearanceSettings />
          <div className="border-t border-border pt-5"><PreviewQualitySettings projectId={projectId} /></div>
          <div className="border-t border-border pt-5"><KeyboardShortcutSettings /></div>
        </section>
        <section className="space-y-3 rounded-xl bg-[var(--chrome-panel)] p-6" aria-labelledby="privacy-settings-title">
          <h2 id="privacy-settings-title" className="text-lg font-semibold">Privacy</h2>
          <div className="space-y-1 text-sm">
            <h3 className="font-medium">Your files</h3>
            <p className="text-muted-foreground">DreamCut edits locally. We never collect your footage for product improvement.</p>
          </div>
          <div className="space-y-1 text-sm">
            <h3 className="font-medium">Help us improve</h3>
            <p className="text-muted-foreground">
              While you’re signed in, editing history, suggested edits, feedback and how your agent uses DreamCut’s
              tools are uploaded to your DreamCut account to improve the product, even if you never export, and
              errors are reported with a short replay of the editor screen (your videos, images and audio are hidden). Signed out,
              nothing is uploaded or reported. Sharing is on by default; turn it off below to stop both.
            </p>
          </div>
          <label className="flex items-center justify-between gap-4 text-sm">Share edits to improve DreamCut
            <Checkbox disabled={busy} checked={userView.profile.cloud_sharing !== false}
              onCheckedChange={checked => void change({ action: "settings", cloud_sharing: checked }).then(saved => { if (saved) void refreshCloudSentry(); })} /></label>
        </section>
      </div>}
      {userView && tab === "Skills" && <div className="memory-page-column">
        <UserSkills skills={userView.user_skills} />
      </div>}

    </div>
  </section>;
}

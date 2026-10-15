"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { UserSkills } from "./UserSkills";
import { VideoIdeas } from "./VideoIdeas";
import { PreviewQualitySettings } from "./PreviewQualitySettings";
import { EditorAppearanceSettings } from "@/app/EditorAppearance";
import { PanelShortcutSettings } from "./PanelShortcutSettings";
import { StyleDocumentEditor } from "./StyleDocumentEditor";
import { CloudAccountBadge, CloudAccountSettings } from "./CloudAccountSettings";
import { CloudStyleSuggestions } from "./CloudStyleSuggestions";
import { EditingDirections } from "./EditingDirections";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, History, UserRound } from "lucide-react";
import styles from "./EditingMemory.module.css";

import type { MemoryPage, EditChapter, EditingPreference } from "@/lib/local-store/editing-memory";

type View = MemoryPage;
// Mirrors MEMORY_CHAPTER_PAGE_SIZE without importing the server-only module into the client bundle.
const MEMORY_CHAPTER_PAGE_SIZE = 50;
type UserTab = "My style" | "Video ideas" | "Skills" | "Settings";

const preferenceCategories = ["Pacing", "Captions", "Visuals", "Audio", "Delivery", "Workflow"] as const;
const tabs: UserTab[] = ["My style", "Video ideas", "Skills", "Settings"];
const tabKeys = { "My style": "style", "Video ideas": "ideas", Skills: "skills", Settings: "settings" } as const;

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
  const [filter, setFilter] = useState("All");
  const [chapterLimit, setChapterLimit] = useState(MEMORY_CHAPTER_PAGE_SIZE);
  const [chapterDetails, setChapterDetails] = useState<Record<string, EditChapter>>({});
  const version = useRef<{ query: string; etag: string } | null>(null);
  const outbox = useRef<View["retro_outbox"] | null>(null);
  const url = `/api/projects/${projectId}/memory`;
  const query = history
    ? `view=page&section=history&chapters_limit=${chapterLimit}&chapter_category=${encodeURIComponent(filter)}`
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
      outbox.current = data.retro_outbox;
      setView(data);
      setError("");
    } catch (nextError) {
      setError(String(nextError));
    }
  }, [url, query]);

  // Memory activity resumes the export-review outbox (see the export retrospective contract).
  // Reads never dispatch; this explicit action only runs while the outbox has work.
  const resumeRetros = useCallback(async () => {
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resume_retros" }) });
      if (response.ok) outbox.current = (await response.json()).retro_outbox;
    } catch { /* the next poll retries */ }
  }, [url]);

  useEffect(() => { void resumeRetros(); }, [resumeRetros]);

  useEffect(() => {
    void refresh();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const pending = outbox.current;
      if (pending && (pending.waiting || pending.queued || pending.running)) void resumeRetros();
      void refresh();
    };
    const timer = window.setInterval(tick, 5_000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh, resumeRetros]);

  const loadChapter = useCallback(async (id: string) => {
    if (chapterDetails[id]) return;
    try {
      const response = await fetch(`${url}?chapter=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setChapterDetails(current => ({ ...current, [id]: data.chapter }));
    } catch (nextError) {
      setError(String(nextError));
    }
  }, [url, chapterDetails]);

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
  const pendingSkillImprovements = userView?.skill_candidates.filter(candidate => candidate.status === "pending").length ?? 0;
  const maintenance = userView?.skill_maintenance_jobs[0] ?? null;
  const maintenanceActive = maintenance && ["queued", "running", "ready"].includes(maintenance.status);
  const personalPreferences = view?.profile.preferences.filter(item => item.scope !== "project" || item.project_id === projectId) ?? [];
  const renderPreference = (item: EditingPreference) => <article className={styles.preference} key={item.id}>
    <p>{item.text}</p>
    <div className={styles.preferenceMeta}>
      <span>{item.scope === "all" ? "All my edits" : item.scope === "project" ? `${projectTitle} only` : "Vertical videos"}</span>
      <details><summary>Details</summary><p>{item.origin === "human" ? "Saved from your direction" : "Learned from a retrospective"}</p>{item.evidence.map(evidence => <div className={styles.evidence} key={evidence}>{evidence}</div>)}</details>
      <button disabled={busy} onClick={() => void preference(item, item.status === "active" ? "retired" : "active")}>{item.status === "active" ? "Disable" : "Use preference"}</button>
    </div>
  </article>;

  return <section className={`editor-chrome memory-page ${styles.page}`} aria-labelledby="editing-memory-title">
    <PageHeader id="editing-memory-title" icon={history ? <History size={19} /> : <UserRound size={19} />}
      back={history ? <Link href={`/p/${projectId}`} className="memory-eyebrow">← Back to editor</Link> : undefined}
      eyebrow={history ? projectTitle : undefined /* User is account-wide */}
      title={<>{history ? "Project history" : "User"} {!history && pendingSkillImprovements > 0 && <span className="memory-attention-badge">{pendingSkillImprovements}</span>}</>}
      subtitle={history ? undefined : <CloudAccountBadge action={tab !== "Settings" /* Settings has the account section and its Sign in */} />}>
      {!history && <SegmentedControl className={styles.tabs} aria-label="User sections" role="tablist">
        {tabs.map((name, index) => <button key={name} id={`user-tab-${index}`} type="button" role="tab" aria-controls="memory-panel" tabIndex={tab === name ? 0 : -1} aria-selected={tab === name} onClick={() => setTab(name)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); setTab(tabs[next]!);
          document.getElementById(`user-tab-${next}`)?.focus();
        }}>{name}{name === "Skills" && pendingSkillImprovements > 0 ? <span className="memory-attention-badge">{pendingSkillImprovements}</span> : null}</button>)}
      </SegmentedControl>}
    </PageHeader>

    <div id="memory-panel" className="memory-body memory-page-body" role={history ? "region" : "tabpanel"} aria-labelledby={history ? "editing-memory-title" : `user-tab-${tabs.indexOf(tab)}`} tabIndex={0} key={tab}>
      {!history && tab === "Video ideas" && <VideoIdeas />}
      {tab !== "Video ideas" && error && <p role="alert">{error}</p>}
      {tab !== "Video ideas" && !view && !error && <p>Loading…</p>}
      {userView && tab === "My style" && <div className="memory-page-column">
        <div className="memory-section-intro"><h2>My style</h2></div>
        <StyleDocumentEditor document={userView.style_document} busy={busy} onDirty={setStyleDirty} save={(markdown, revision) => change({action: "style_document", markdown, expected_revision: revision})} />
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
            <NativeSelect aria-label="Preference category" value={category} onChange={event => setCategory(event.target.value as typeof category)}>{preferenceCategories.map(value => <option key={value}>{value}</option>)}</NativeSelect>
            <button disabled={busy || !text.trim()}>Save preference</button>
          </div>
        </form>
        </details>

      </div>}


      {historyView && <div className="memory-page-column"><details className="memory-card"><summary>Export reviews · {historyView.retros.length}</summary>
        <div className="memory-section-intro"><h2>Export reviews</h2></div>
        {(!historyView.profile.learning || !historyView.profile.agent_retros) && <div className="memory-card"><p>Export reviews paused</p><button disabled={busy} onClick={() => void change({ action: "settings", learning: true, agent_retros: true })}>Enable export reviews</button></div>}
        <button disabled={busy} onClick={() => void change({ action: "retro" })}>Review current edit</button>

        {!historyView.retros.length && <p>No export reviews yet.</p>}
        {historyView.retros.map(retro => <article className="memory-card" key={retro.id}>
          <div className="memory-eyebrow">{new Date(retro.created_at).toLocaleString()} <span className="memory-status" data-status={retro.status}>{retro.status}</span></div><p>{retro.summary ?? "Saved editing checkpoint"}</p>{retro.error && <p>{retro.error}</p>}
          {retro.status === "complete" && <p>{historyView.retro_skill_candidate_counts[retro.id] ?? 0} skill improvement proposals</p>}
          {!!retro.findings?.length && <details><summary>Lessons and evidence · {retro.findings.length}</summary>{retro.findings.map((finding, index) => <div key={index} className="memory-card"><div className="memory-eyebrow">{finding.category} · {finding.disposition.replaceAll("_", " ")}</div><p>{finding.lesson}</p><details><summary>Evidence</summary>{finding.evidence.map(evidence => <div key={evidence}>{evidence}</div>)}</details></div>)}</details>}
          {retro.status !== "complete" && <button disabled={busy || retro.status === "waiting"} onClick={() => void change({ action: "retro", id: retro.id })}>{retro.status === "running" ? "Check / recover interrupted run" : "Run review"}</button>}
        </article>)}
        </details></div>}

      {historyView && <div className="memory-page-column memory-page-column-wide">
        <div className="memory-section-intro"><h2>Editing decisions</h2></div>
        <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`${url}?download=ledger`} download><Download />Download project history</a>
        <EditingDirections projectId={projectId} feedback={historyView.feedback} onSaved={refresh} />
        <details className="memory-card" open><summary>Sequence map · {historyView.sequences.length} visual clips</summary><div className="memory-sequence">{historyView.sequences.map(sequence => <Link key={sequence.id} href={`/p/${projectId}?at=${sequence.start}`}>
          <strong>{sequence.start.toFixed(1)}s → {(sequence.start + sequence.duration).toFixed(1)}s</strong><span>{sequence.label}</span><small>{sequence.lane}</small>
        </Link>)}</div></details>
        <details className="memory-card"><summary>Proposal decisions · {historyView.proposals.length}</summary>{historyView.proposals.map(proposal => <div className="memory-card" key={proposal.proposal_id}><span className="memory-status" data-status={proposal.status}>{proposal.status}</span>{proposal.proposal.summary}</div>)}</details>
        <div className="memory-row"><h3>Changes</h3><select aria-label="Filter changes" value={filter} onChange={event => setFilter(event.target.value)}>{["All", "Timeline", "Pacing", "Captions", "Audio", "Marks", "Review"].map(value => <option key={value}>{value}</option>)}</select></div>
        {historyView.chapters.map(chapter => <article className="memory-card" key={chapter.id}>
          <div className="memory-eyebrow">{chapter.category} · {new Date(chapter.time).toLocaleString()}</div><p>{chapter.summary}</p>
          {chapter.seconds !== null && <Link className="memory-jump-link" href={`/p/${projectId}?at=${chapter.seconds}`}>Open in editor at {chapter.seconds.toFixed(1)}s</Link>}
          <details onToggle={event => { if (event.currentTarget.open) void loadChapter(chapter.id); }}><summary>Before and after · {chapter.change_count} clips</summary>{chapterDetails[chapter.id]?.changes.map(changeItem => <details key={changeItem.id}><summary>{changeItem.label}</summary><div className="memory-diff"><div>Before<pre>{JSON.stringify(changeItem.before, null, 2)}</pre></div><div>After<pre>{JSON.stringify(changeItem.after, null, 2)}</pre></div></div></details>) ?? <p>Loading…</p>}</details>
          {chapter.context_change_count > 0 && <details onToggle={event => { if (event.currentTarget.open) void loadChapter(chapter.id); }}><summary>Project settings, marks, and selections</summary>{chapterDetails[chapter.id]?.context_changes.map(changeItem => <details key={changeItem.field}><summary>{changeItem.field.replaceAll("_", " ")}</summary><div className="memory-diff"><div>Before<pre>{JSON.stringify(changeItem.before, null, 2)}</pre></div><div>After<pre>{JSON.stringify(changeItem.after, null, 2)}</pre></div></div></details>) ?? <p>Loading…</p>}</details>}
        </article>)}
        {historyView.chapter_page.next_cursor && <button className={buttonVariants({ variant: "outline", size: "sm" })} onClick={() => setChapterLimit(limit => limit + MEMORY_CHAPTER_PAGE_SIZE)}>Show earlier changes</button>}
      </div>}

      {userView && tab === "Settings" && <div className="memory-page-column flex flex-col gap-4">
        <CloudAccountSettings />
        <section className="space-y-5 rounded-xl bg-[var(--chrome-panel)] p-6" aria-labelledby="computer-settings-title">
          <h2 id="computer-settings-title" className="text-lg font-semibold">Settings for this computer</h2>
          <EditorAppearanceSettings />
          <div className="border-t border-border pt-5"><PanelShortcutSettings /></div>
          <div className="border-t border-border pt-5"><PreviewQualitySettings projectId={projectId} /></div>
        </section>
        <section className="space-y-3 rounded-xl bg-[var(--chrome-panel)] p-6" aria-labelledby="learning-settings-title">
          <h2 id="learning-settings-title" className="text-lg font-semibold">Learning and privacy</h2>
          {([
            ["Learn from exports", userView.profile.learning, false, { learning: true }],
            ["Review exports with Codex", userView.profile.agent_retros, false, { agent_retros: true }],
            ["Automatically apply learned preferences", Boolean(userView.profile.auto_apply_preferences), false, { auto_apply_preferences: true }],
            ["Share editing history to improve DreamCut (never media)", userView.profile.learning && userView.profile.cloud_sharing !== false, !userView.profile.learning, { cloud_sharing: true }],
          ] as const).map(([label, checked, disabled, key]) => <label key={label} className="flex items-center justify-between gap-4 text-sm">{label}
            <input type="checkbox" className="size-4 accent-[var(--accent)]" disabled={busy || disabled} checked={checked}
              onChange={event => void change({ action: "settings", [Object.keys(key)[0]]: event.target.checked })} /></label>)}
        </section>
      </div>}
      {userView && tab === "Skills" && <div className="memory-page-column">
        <details className="memory-card"><summary>Skill improvements{pendingSkillImprovements > 0 ? ` · ${pendingSkillImprovements} to review` : ""}</summary>
        {userView.skill_update_events.map(event => <article className="memory-card" key={event.id}>
          <div className="memory-eyebrow">Applied skill update · {String(event.data?.target_skill ?? "Skill")}</div>
          <p>{event.summary}</p>
          {typeof event.data?.before === "string" && typeof event.data?.after === "string" && <details><summary>Preview applied skill change</summary><div className="memory-diff"><div>Before<pre>{event.data.before}</pre></div><div>Applied<pre>{event.data.after}</pre></div></div></details>}
        </article>)}
        <section className="memory-improvements" aria-labelledby="skill-maintenance-title">
          <div className="memory-section-intro"><h3 id="skill-maintenance-title">Skill maintenance</h3></div>
          <button disabled={busy || Boolean(maintenanceActive)} onClick={() => void change({ action: "skill_maintenance", operation: "start" })}>Review and consolidate skills</button>
          {maintenance && <article className="memory-card">
            <div className="memory-eyebrow">Library review · {maintenance.status}</div>
            <p>{maintenance.summary ?? (maintenance.status === "queued" ? "Waiting…" : maintenance.status === "running" ? "Reviewing skills…" : "No summary")}</p>
            {maintenance.worker_count !== undefined && <p>{maintenance.worker_count} bounded agent pass{maintenance.worker_count === 1 ? "" : "es"}; {maintenance.inspections?.length ?? 0} skills inspected; {maintenance.changes?.length ?? 0} updates recommended.</p>}
            {maintenance.error && <p role="alert">{maintenance.error}</p>}
            {!!maintenance.inspections?.length && <details><summary>Inspection map</summary>{maintenance.inspections.map(item => <div className="memory-card" key={item.skill}><div className="memory-eyebrow">{item.skill} · {item.recommendation}</div><p>{item.rationale}</p></div>)}</details>}
            {!!maintenance.evaluation_verdicts?.length && <details><summary>Independent evaluation</summary>{maintenance.evaluation_verdicts.map(item => <div className="memory-card" key={item.skill}><div className="memory-eyebrow">{item.skill} · {item.verdict}</div><p>{item.rationale}</p>{item.concerns.map(concern => <p key={concern}>{concern}</p>)}</div>)}</details>}
            {!!maintenance.changes?.length && <details open><summary>Recommended updates · {maintenance.changes.length}</summary>{maintenance.changes.map(item => <div className="memory-card" key={item.skill}>
              <div className="memory-eyebrow">{item.skill}</div><p>{item.summary}</p><p>{item.evaluator_rationale}</p>
              {!!item.research_sources.length && <details><summary>Research sources</summary>{item.research_sources.map(source => <p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> — {source.claim}</p>)}</details>}
              {!!item.evaluation_cases.length && <details><summary>Forward evaluation cases</summary>{item.evaluation_cases.map((testCase, index) => <p key={index}><strong>{testCase.request}</strong><br />{testCase.expected_behavior}</p>)}</details>}
              <details><summary>Full skill diff</summary><div className="memory-diff"><div>Current<pre>{item.current_content}</pre></div><div>Proposed<pre>{item.proposed_content}</pre></div></div></details>
            </div>)}</details>}
            {maintenance.status === "ready" && <div className="memory-row">
              <button disabled={busy} onClick={() => void change({ action: "skill_maintenance", operation: "apply", id: maintenance.id })}>{maintenance.changes?.length ? "Apply skill maintenance" : "Mark review complete"}</button>
              <button disabled={busy} onClick={() => void change({ action: "skill_maintenance", operation: "reject", id: maintenance.id })}>Reject bundle</button>
            </div>}
          </article>}
        </section>
        <section className="memory-improvements" aria-labelledby="skill-improvements-title">
          <div className="memory-section-intro"><h3 id="skill-improvements-title">Skill improvement proposals</h3></div>
          {!userView.skill_candidates.length && <p>No proposals to review.</p>}
          {userView.skill_candidates.filter(candidate => !candidate.reconciled_into).map(candidate => <article className="memory-card" key={candidate.id}>
            <div className="memory-eyebrow">{candidate.target_skill ?? "Target skill needed"} · {candidate.status}</div>
            <p>{candidate.proposed_change}</p>
            {candidate.preview && <details><summary>Preview skill change</summary><div className="memory-diff"><div>Current<pre>{candidate.preview.current}</pre></div><div>After approval<pre>{candidate.preview.proposed}</pre></div></div></details>}
            {candidate.status === "pending" && candidate.review_state === "changed" && <p>Target skill has newer guidance.</p>}
            {candidate.status === "pending" && candidate.review_state === "already_present" && <p>Already in the current skill.</p>}
            {candidate.status === "pending" && candidate.review_state === "missing" && <p>Target skill no longer exists.</p>}
            <details><summary>Evidence and promotion</summary><p>{candidate.gate}</p>{candidate.evidence.map(evidence => <div key={evidence}>{evidence}</div>)}{candidate.evolution_log && <p>Recorded in {candidate.evolution_log}</p>}</details>
            {candidate.status === "pending" && <div className="memory-row">
              <button disabled={busy || candidate.review_state === "unassigned" || candidate.review_state === "missing"} onClick={() => void change({ action: "skill_candidate", id: candidate.id, decision: "approve" })}>{candidate.review_state === "already_present" ? "Reconcile existing lesson" : candidate.review_state === "changed" ? "Approve and merge" : "Approve and update skill"}</button>
              <button disabled={busy} onClick={() => void change({ action: "skill_candidate", id: candidate.id, decision: "reject" })}>Reject</button>
            </div>}
          </article>)}
        </section>
        </details>
        <UserSkills skills={userView.user_skills} />
      </div>}

    </div>
  </section>;
}

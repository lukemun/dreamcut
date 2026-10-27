"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Sentry from "@sentry/nextjs";
import { BugIcon, CheckCircle2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SettingField } from "@/components/ui/setting-field";

/** Report a bug: a short description, always sent to Sentry with the replay of the last minute
 * (masked per REPLAY_PRIVACY). Shown only where Sentry is enabled, since that is where the replay is
 * recorded and the report goes. With a project open, the report can also carry that project's local
 * session evidence (opt-in per report, off by default; see src/lib/observability/session-evidence.ts). */
export function BugReportButton({ projectId }: { projectId?: string } = {}) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setAvailable(!!Sentry.getClient()); }, []);
  if (!available) return null;
  return <>
    <Button variant="ghost" size="icon-sm" aria-label="Report a bug" title="Report a bug" onClick={() => setOpen(true)}><BugIcon aria-hidden="true" /></Button>
    {open && createPortal(<BugReportDialog projectId={projectId} onClose={() => setOpen(false)} />, document.body)}
  </>;
}

type Phase = "editing" | "sending" | "sent" | "failed";
const MAX_DESCRIPTION = 4000;
type EvidenceManifest = { items: Array<{ label: string; count: number }>; excluded: string[]; bytes: number };
const EVIDENCE_FILE = "dreamcut-session-evidence.json";

function BugReportDialog({ projectId, onClose }: { projectId?: string; onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>("editing");
  // Off for every report; the list of what the project's evidence holds shows before anything is sent.
  const [attachEvidence, setAttachEvidence] = useState(false);
  const [manifest, setManifest] = useState<EvidenceManifest | null | "unavailable">(null);
  const evidenceId = useId();
  useEffect(() => {
    if (!attachEvidence || !projectId || manifest) return;
    let live = true;
    fetch(`/api/projects/${encodeURIComponent(projectId)}/session-evidence?manifest=1`)
      .then(response => response.ok ? response.json() as Promise<EvidenceManifest> : Promise.reject(new Error(String(response.status))))
      .then(found => { if (live) setManifest(found); }, () => { if (live) setManifest("unavailable"); });
    return () => { live = false; };
  }, [attachEvidence, manifest, projectId]);
  // The DreamCut account's email, when signed in, so the team knows who to reply to.
  const [email, setEmail] = useState<string>();
  const descriptionId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && phase !== "sending") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);
  const [opener] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useEffect(() => () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); }, [opener]);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, []);
  // Started on open; Send waits for it so a quick report still carries the email.
  const [account] = useState(() => fetch("/api/user/cloud-account").then(response => response.ok ? response.json() : null)
    .then((found: { signed_in?: boolean; email?: string | null } | null) => found?.signed_in && found.email ? found.email : undefined, () => undefined));
  useEffect(() => {
    let live = true;
    void account.then(found => { if (live) setEmail(found); });
    return () => { live = false; };
  }, [account]);

  const evidenceReady = !attachEvidence || (manifest !== null && manifest !== "unavailable");
  const canSend = description.trim().length > 0 && phase !== "sending" && evidenceReady;
  const send = async () => {
    if (!canSend) return;
    setPhase("sending");
    const email = await account;
    // The evidence is read again at send time so the report carries what the list described, as of now.
    const attachments = attachEvidence && projectId
      ? await fetch(`/api/projects/${encodeURIComponent(projectId)}/session-evidence`)
        .then(response => response.ok ? response.text() : Promise.reject(new Error(String(response.status))))
        .then(text => [{ filename: EVIDENCE_FILE, data: text, contentType: "application/json" }], () => null)
      : [];
    if (!attachments) { setPhase("failed"); return; }
    // sendFeedback copies `tags` onto the current scope (@sentry/feedback 10.75); a forked scope
    // keeps the reporter tag off later error events.
    const sent = await Sentry.withScope(() => Sentry.sendFeedback(
      { message: description.trim(), ...(email ? { email, tags: { reporter_email: email, ...(attachments.length ? { session_evidence: "attached" } : {}) } } : attachments.length ? { tags: { session_evidence: "attached" } } : {}) },
      { includeReplay: true, ...(attachments.length ? { attachments } : {}) },
    )).then(() => true, () => false);
    setPhase(sent ? "sent" : "failed");
  };
  const evidenceStatus = !attachEvidence ? undefined
    : manifest === null ? "Reading this project's evidence…"
      : manifest === "unavailable" ? "This project's evidence could not be read. Untick to send the report without it."
        : <>
          Attaches, from this project only: {manifest.items.filter(item => item.count > 0).map(item => `${item.label} (${item.count})`).join(", ") || "nothing recorded yet"}.
          {" "}{manifest.excluded.join(" ")}
        </>;

  const title = phase === "sent" ? "Report sent" : "Report a bug";
  return (
    <div className="timeline-export-backdrop fixed inset-0 z-(--layer-dialog) flex items-center justify-center p-4" data-replay-block onClick={() => { if (phase !== "sending") onClose(); }}>
      <div
        className="editor-chrome timeline-export-dialog flex max-h-[min(90dvh,46rem)] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl"
        role="dialog" aria-modal="true" aria-labelledby="bug-report-title"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4">
          <h2 id="bug-report-title" ref={titleRef} tabIndex={-1} className="text-lg font-semibold text-[var(--ink)] outline-none">{title}</h2>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" disabled={phase === "sending"} onClick={onClose}><XIcon /></Button>
        </header>

        {phase === "sent" ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <CheckCircle2Icon className="size-8 text-[var(--ink)]" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-sm text-[var(--ink-secondary)]" role="status">Thanks. The DreamCut team has your report.</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <SettingField label="What went wrong?" htmlFor={descriptionId} status={email ? `From ${email}` : undefined}>
              <textarea
                id={descriptionId} value={description} maxLength={MAX_DESCRIPTION} rows={4} autoFocus
                disabled={phase === "sending"} onChange={event => setDescription(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); } }}
                className="min-h-24 w-full resize-y rounded-lg border border-[var(--edge-outline)] bg-[var(--glass-field,var(--color-card))] px-2.5 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-foreground/65 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </SettingField>
            {projectId ? (
              <SettingField label="Session evidence" labelId={`${evidenceId}-label`} status={evidenceStatus}>
                <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
                  <Checkbox id={evidenceId} checked={attachEvidence} disabled={phase === "sending"} aria-describedby={`${evidenceId}-label`}
                    onCheckedChange={checked => setAttachEvidence(checked)} />
                  Attach this project's session evidence
                </label>
              </SettingField>
            ) : null}
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-1">
          <span className="min-w-0 text-sm" aria-live="polite">
            {phase === "failed" ? <span role="alert" className="text-destructive-foreground">The report could not be sent. Check your connection and try again.</span> : null}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {phase === "sent"
              ? <Button type="button" autoFocus onClick={onClose}>Done</Button>
              : <>
                <Button type="button" variant="outline" disabled={phase === "sending"} onClick={onClose}>Cancel</Button>
                <Button type="button" disabled={!canSend} onClick={() => void send()}>{phase === "sending" ? "Sending…" : phase === "failed" ? "Try again" : "Send"}</Button>
              </>}
          </div>
        </footer>
      </div>
    </div>
  );
}

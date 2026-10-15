"use client";

import { useState } from "react";
import { publishPanelShortcuts, usePanelShortcuts } from "@/components/studio/hooks/usePanelShortcuts";
import { shortcutFromKeyEvent, type PanelShortcuts } from "@/lib/panel-shortcuts";

const PANELS = [
  { id: "library", label: "Library drawer" },
  { id: "proposals", label: "Proposals drawer" },
] as const;

export function PanelShortcutSettings() {
  const shortcuts = usePanelShortcuts();
  const [recording, setRecording] = useState<keyof PanelShortcuts | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (panel: keyof PanelShortcuts, key: string) => {
    const next = { ...shortcuts, [panel]: key };
    if (key !== "Off" && next.library === next.proposals) {
      setError(`${key} is already used by the ${panel === "library" ? "Proposals" : "Library"} drawer. Press another key.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/panel-shortcuts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error("Could not save the shortcut.");
      publishPanelShortcuts(next);
      setRecording(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the shortcut."); }
    finally { setSaving(false); }
  };

  return <section className="space-y-3" aria-labelledby="keyboard-shortcuts-title">
    <h3 id="keyboard-shortcuts-title" className="text-sm font-semibold text-[var(--ink)]">Keyboard shortcuts</h3>
    <div className="space-y-3">{PANELS.map(panel => {
      const active = recording === panel.id;
      // Same row shape as Appearance: label left, control right, no box of its own.
      return <div key={panel.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="min-w-36 flex-1 text-[var(--ink)]">{panel.label}</div>
        <button type="button" disabled={saving} aria-label={active ? `Press a key for ${panel.label}; Backspace turns off; Escape cancels` : `Change ${panel.label} shortcut, currently ${shortcuts[panel.id]}`}
          className="min-w-32 rounded-md border border-[var(--chrome-line-strong)] bg-[var(--chrome-raised)] px-3 py-2 text-sm font-medium text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chrome-selected-ring)] disabled:opacity-60"
          onClick={event => { setError(""); setRecording(panel.id); event.currentTarget.focus(); }}
          onKeyDown={event => {
            if (!active) return;
            event.preventDefault(); event.stopPropagation();
            if (event.key === "Escape") { setRecording(null); setError(""); return; }
            if (event.key === "Backspace" || event.key === "Delete") { void save(panel.id, "Off"); return; }
            const key = shortcutFromKeyEvent(event.nativeEvent);
            if (!key) { setError("Press one unused letter without Shift, Control, Option, or Command."); return; }
            void save(panel.id, key);
          }}>
          {active ? "Press a key · ⌫ off" : <><kbd>{shortcuts[panel.id]}</kbd><span className="ml-2 font-normal text-[var(--ink-muted)]">Change</span></>}
        </button>
      </div>;
    })}</div>
    {error && <p role="alert" className="text-sm text-[var(--editor-destructive-ink)]">{error}</p>}
  </section>;
}

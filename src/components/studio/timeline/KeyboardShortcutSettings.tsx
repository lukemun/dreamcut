"use client";

import { useEffect, useState } from "react";
import { publishKeyboardShortcuts, useKeyboardShortcuts } from "@/components/studio/hooks/useKeyboardShortcuts";
import {
  DEFAULT_KEYBOARD_SHORTCUTS, FIXED_SHORTCUTS, isMacPlatform, OFF, SHORTCUT_COMMAND_IDS, SHORTCUT_COMMANDS, SHORTCUT_GROUPS,
  shortcutConflict, shortcutFromKeyEvent, shortcutLabel, type KeyboardShortcuts, type ShortcutCommand,
} from "@/lib/keyboard-shortcuts";

const KEY_BOX = "inline-block min-w-32 rounded-md border border-[var(--edge-outline)] bg-[var(--chrome-raised)] px-3 py-2 text-sm font-medium text-[var(--ink)]";
const KEY_BUTTON = "min-w-32 rounded-md border border-[var(--edge-outline)] bg-[var(--chrome-raised)] px-3 py-2 text-sm font-medium text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chrome-selected-ring)] disabled:opacity-60";
const QUIET_BUTTON = "rounded-md px-2 py-2 text-sm text-[var(--ink-secondary)] hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chrome-selected-ring)] disabled:opacity-60";

/** Every editor command's key: click a key, press the new one; Escape cancels. */
export function KeyboardShortcutSettings() {
  const shortcuts = useKeyboardShortcuts();
  const [recording, setRecording] = useState<ShortcutCommand | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ command: ShortcutCommand | null; message: string } | null>(null);
  // Labels use the platform's modifier names; settle them after mount so server and client render alike.
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(isMacPlatform()), []);
  const label = (binding: string) => shortcutLabel(binding, mac);
  const customised = SHORTCUT_COMMAND_IDS.some(id => shortcuts[id] !== DEFAULT_KEYBOARD_SHORTCUTS[id]);

  const save = async (next: KeyboardShortcuts, command: ShortcutCommand | null) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/keyboard-shortcuts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error.replace(/^Error: /, "") : "Could not save the shortcut.");
      publishKeyboardShortcuts(next);
      setRecording(null);
    } catch (cause) { setError({ command, message: cause instanceof Error ? cause.message : "Could not save the shortcut." }); }
    finally { setSaving(false); }
  };

  const bind = (command: ShortcutCommand, binding: string) => {
    const other = shortcutConflict(shortcuts, command, binding);
    if (other) { setError({ command, message: `${label(binding)} is already ${SHORTCUT_COMMANDS[other].label}. Press another key, or change that one first.` }); return; }
    void save({ ...shortcuts, [command]: binding }, command);
  };

  return <section className="space-y-4" aria-labelledby="keyboard-shortcuts-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 id="keyboard-shortcuts-title" className="text-sm font-semibold text-[var(--ink)]">Keyboard shortcuts</h3>
      {customised && <button type="button" className={QUIET_BUTTON} disabled={saving} onClick={() => void save(DEFAULT_KEYBOARD_SHORTCUTS, null)}>Reset all</button>}
    </div>
    {SHORTCUT_GROUPS.map(group => <div key={group} role="group" aria-labelledby={`shortcut-group-${group}`} className="space-y-2">
      <h4 id={`shortcut-group-${group}`} className="text-xs font-medium text-[var(--ink-muted)]">{group}</h4>
      {SHORTCUT_COMMAND_IDS.filter(id => SHORTCUT_COMMANDS[id].group === group).map(id => {
        const command = SHORTCUT_COMMANDS[id];
        const active = recording === id;
        const binding = shortcuts[id];
        // Same row shape as Appearance: name left, control right, no box of its own.
        return <div key={id} className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="min-w-36 flex-1 text-[var(--ink)]">{command.label}</div>
            <div className="flex items-center gap-1">
              {active && <button type="button" className={QUIET_BUTTON} disabled={saving} onClick={() => void save({ ...shortcuts, [id]: OFF }, id)}>Off</button>}
              {!active && binding !== command.default && <button type="button" className={QUIET_BUTTON} disabled={saving}
                aria-label={`Reset ${command.label} to ${label(command.default)}`} onClick={() => bind(id, command.default)}>Reset</button>}
              <button type="button" disabled={saving} aria-pressed={active}
                aria-label={active ? `Press a key for ${command.label}; Escape cancels` : `Change ${command.label} shortcut, currently ${binding === OFF ? "off" : label(binding)}`}
                className={KEY_BUTTON}
                onClick={event => { setError(null); setRecording(active ? null : id); event.currentTarget.focus(); }}
                onKeyDown={event => {
                  if (!active) return;
                  if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setRecording(null); setError(null); return; }
                  if (event.key === "Tab") return;
                  event.preventDefault(); event.stopPropagation();
                  const next = shortcutFromKeyEvent(event.nativeEvent);
                  // A lone Shift, Command or Option waits for the key it modifies.
                  if (!next) { if (!["Shift", "Meta", "Control", "Alt"].includes(event.key)) setError({ command: id, message: "That key is reserved. Press another." }); return; }
                  bind(id, next);
                }}>
                {active ? "Press a key" : binding === OFF ? <span className="text-[var(--ink-muted)]">Off</span> : <><kbd>{label(binding)}</kbd><span className="ml-2 font-normal text-[var(--ink-muted)]">Change</span></>}
              </button>
            </div>
          </div>
          {error?.command === id && <p role="alert" className="text-sm text-[var(--editor-destructive-ink)]">{error.message}</p>}
        </div>;
      })}
      {FIXED_SHORTCUTS.filter(fixed => fixed.group === group).map(fixed => <div key={fixed.label} className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="min-w-36 flex-1 text-[var(--ink)]">{fixed.label}</div>
        {/* Same box as a changeable key, without the Change action: these keys stay fixed. */}
        <span className={`${KEY_BOX} text-center`}><kbd>{fixed.keys}</kbd></span>
      </div>)}
    </div>)}
    {error && error.command === null && <p role="alert" className="text-sm text-[var(--editor-destructive-ink)]">{error.message}</p>}
  </section>;
}

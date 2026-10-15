"use client";
import { useEffect, useState, useId } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { PREVIEW_QUALITIES, PREVIEW_QUALITY_KEY, PREVIEW_QUALITY_EVENT, parsePreviewQuality, readPreviewQuality, type PreviewQuality } from "@/lib/preview-quality";

export function PreviewQualitySettings({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const fieldId = useId();
  const [quality, setQuality] = useState(readPreviewQuality);
  const [status, setStatus] = useState("Checking previews…");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const save = async (next: PreviewQuality) => {
    setSaving(true); setSaveError("");
    try {
      const response = await fetch("/api/preview-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quality: next, project_id: projectId }) });
      if (!response.ok) throw new Error("Could not save preview settings.");
      setQuality(next); setStatus("Preparing project previews…");
      try { window.localStorage.setItem(PREVIEW_QUALITY_KEY, next); } catch { /* Server remains authoritative. */ }
      window.dispatchEvent(new Event(PREVIEW_QUALITY_EVENT));
    } catch (error) { setSaveError(String(error)); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const response = await fetch(`/api/preview-settings?project_id=${encodeURIComponent(projectId)}`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (cancelled) return;
        setQuality(data.quality);
        const media = data.media as {state: string; dimensions?: {width: number; height: number}}[];
        const ready = media.filter(item => item.state === "ready");
        const errors = media.filter(item => item.state === "failed").length;
        const sizes = [...new Set(ready.map(item => item.dimensions ? `${item.dimensions.width} × ${item.dimensions.height}` : ""))].filter(Boolean);
        setFailed(errors > 0);
        setStatus(`${ready.length} of ${media.length} previews ready.${errors ? ` ${errors} failed.` : ready.length < media.length ? " Preparing updated previews…" : ""}${sizes.length ? ` Prepared sizes: ${sizes.join("; ")}.` : ""}`);
      } catch { if (!cancelled) setStatus("Could not read preview information."); }
    };
    void read();
    const timer = window.setInterval(read, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [projectId, quality, saving]);
  return <section className={compact ? "space-y-1.5" : "space-y-4"} aria-label="Preview quality settings">
    {/* Settings page: the same label-left, control-right row as Appearance; the compact editor popover stacks. */}
    <div className={compact ? "max-w-sm space-y-1.5" : "flex flex-wrap items-center justify-between gap-4"}><label htmlFor={fieldId} className={compact ? "block text-sm font-medium" : "text-sm font-semibold text-[var(--ink)]"}>Playback quality</label>
      <div><NativeSelect id={fieldId} value={quality} disabled={saving} onChange={event => void save(parsePreviewQuality(event.target.value))}>{Object.entries(PREVIEW_QUALITIES).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}</NativeSelect></div>
    </div>
    <p className="text-xs text-muted-foreground" role="status">{compact ? status.split(" Prepared sizes:")[0] : status}</p>
    {failed && <button type="button" disabled={saving} onClick={() => void save(quality)} className="text-sm underline">Retry preparation</button>}
    {saveError && <p role="alert">{saveError}</p>}
  </section>;
}

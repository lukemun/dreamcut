"use client";
import { useEffect, useState, useId } from "react";
import { OptionSelect } from "@/components/ui/select";
import { SettingField } from "@/components/ui/setting-field";
import { PREVIEW_QUALITIES, PREVIEW_QUALITY_EVENT, parsePreviewQuality, previewQualityKey, storePreviewQuality, type PreviewQuality } from "@/lib/preview-quality";

export function PreviewQualitySettings({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const fieldId = useId();
  // The creator's choice for this project; Automatic prepares at the size the player needs.
  const [quality, setQuality] = useState<PreviewQuality>("prepared");
  // Null while every preview is ready at the chosen quality: the setting then needs no status line.
  const [status, setStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const save = async (next: PreviewQuality) => {
    setSaving(true); setSaveError("");
    try {
      const response = await fetch("/api/preview-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quality: next, project_id: projectId }) });
      if (!response.ok) throw new Error("Could not save preview settings.");
      const settings = await response.json() as { choice: PreviewQuality; quality: PreviewQuality };
      setQuality(settings.choice);
      storePreviewQuality(projectId, settings.quality);
    } catch (error) { setSaveError(String(error)); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    let cancelled = false, timer: number | undefined;
    // Polled only while previews are preparing; a new prepared size (this tab or another) reads again.
    const read = async () => {
      window.clearTimeout(timer);
      try {
        const response = await fetch(`/api/preview-settings?project_id=${encodeURIComponent(projectId)}`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (cancelled) return;
        setQuality(parsePreviewQuality(data.choice));
        const media = data.media as {state: string; stale?: boolean}[];
        const preparing = media.filter(item => item.state === "preparing").length;
        const errors = media.filter(item => item.state === "failed").length;
        const stale = media.filter(item => item.stale).length;
        const count = (n: number) => `${n} ${n === 1 ? "preview" : "previews"}`;
        setFailed(errors > 0 || (stale > 0 && preparing === 0));
        setStatus(preparing ? `Preparing ${count(preparing)}…${errors ? ` ${count(errors)} failed.` : ""}`
          : errors ? `${count(errors)} could not be prepared.`
          : stale ? `${count(stale)} made at an earlier setting.`
          : null);
        if (preparing) timer = window.setTimeout(() => void read(), 3000);
      } catch {
        if (cancelled) return;
        setStatus("Could not read preview information.");
        timer = window.setTimeout(() => void read(), 3000);
      }
    };
    const onStorage = (event: StorageEvent) => { if (event.key === previewQualityKey(projectId)) void read(); };
    const onVisible = () => { if (document.visibilityState === "visible") void read(); };
    void read();
    window.addEventListener(PREVIEW_QUALITY_EVENT, read);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true; window.clearTimeout(timer);
      window.removeEventListener(PREVIEW_QUALITY_EVENT, read);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [projectId, quality, saving]);
  const retryLabel = status?.endsWith("earlier setting.") ? "Prepare now" : "Retry preparation";
  const select = <OptionSelect label="Playback quality" value={quality} disabled={saving}
    options={Object.entries(PREVIEW_QUALITIES).map(([value, option]) => ({ value, label: option.label }))}
    onValueChange={value => void save(parsePreviewQuality(value))} />;
  // A status shows only while something needs attention: previews preparing, failed or out of date.
  // The editor popover stacks like every other setting there.
  if (compact) return <section aria-label="Preview quality settings">
    <SettingField label="Playback quality" htmlFor={fieldId} status={status}>{select}</SettingField>
    {failed && <button type="button" disabled={saving} onClick={() => void save(quality)} className="text-sm underline">{retryLabel}</button>}
    {saveError && <p role="alert">{saveError}</p>}
  </section>;
  return <section className="space-y-4" aria-label="Preview quality settings">
    {/* Settings page: the same label-left, control-right row as Appearance. */}
    <div className="flex flex-wrap items-center justify-between gap-4"><label htmlFor={fieldId} className="text-sm font-semibold text-[var(--ink)]">Playback quality</label>
      <div>{select}</div>
    </div>
    <p className="text-xs text-muted-foreground" role="status">{status}</p>
    {failed && <button type="button" disabled={saving} onClick={() => void save(quality)} className="text-sm underline">{retryLabel}</button>}
    {saveError && <p role="alert">{saveError}</p>}
  </section>;
}

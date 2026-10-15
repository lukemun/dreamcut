"use client";

import { NativeSelect } from "@/components/ui/native-select";

import type { AssetDraft } from "@/lib/generation/assets";
import { getAssetModel, modelSettingKeys } from "@/lib/generation/asset-models";

export function ModelSettings({ draft, onChange }: { draft: AssetDraft; onChange: (settings: AssetDraft["settings"]) => void }) {
  const keys = modelSettingKeys(draft), model = getAssetModel(draft), settings = draft.settings ?? {};
  const set = (patch: Partial<NonNullable<AssetDraft["settings"]>>) => onChange({ ...settings, ...patch });
  const field = "w-full min-w-0 rounded-lg border border-[var(--chrome-line)] bg-[var(--chrome-panel)] px-3 py-2 text-sm";
  if (!keys.length) return null;
  return <section className="space-y-3" aria-label="Model settings">
    <div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Model settings</h3><button type="button" className="ml-auto text-xs underline" onClick={() => onChange(undefined)}>Reset model settings</button></div>
    {keys.includes("negativePrompt") ? <label className="grid gap-1 text-xs">Negative prompt<textarea aria-label="Negative prompt" className={field} rows={2} placeholder={model.adapter === "kling" ? "Provider default: blur, distort, and low quality" : "What should the model avoid?"} value={settings.negativePrompt ?? ""} onChange={e => set({ negativePrompt: e.target.value || undefined })} /></label> : null}
    <div className="grid grid-cols-2 gap-3">
      {keys.includes("cfgScale") ? <label className="grid gap-1 text-xs">Prompt adherence (CFG, 0–1)<input aria-label="Prompt adherence (CFG)" type="number" min={0} max={1} step={0.1} className={field} value={settings.cfgScale ?? 0.5} onChange={e => set({ cfgScale: e.target.value === "" ? undefined : Number(e.target.value) })} /></label> : null}
      {keys.includes("seed") ? <label className="grid gap-1 text-xs">Seed<input aria-label="Generation seed" type="number" min={0} max={2147483647} step={1} placeholder="Random" className={field} value={settings.seed ?? ""} onChange={e => set({ seed: e.target.value === "" ? undefined : Number(e.target.value) })} /></label> : null}
      {keys.includes("promptExpansion") ? <label className="grid gap-1 text-xs">Prompt expansion<NativeSelect aria-label="Prompt expansion" className={field} value={settings.promptExpansion ?? "balanced"} onChange={e => set({ promptExpansion: e.target.value as "disabled" | "balanced" | "quality" })}><option value="disabled">Off — keep my prompt</option><option value="balanced">Balanced (default)</option><option value="quality">Quality rewrite — slower</option></NativeSelect></label> : null}
      {keys.includes("safetyTolerance") ? <label className="grid gap-1 text-xs">Safety tolerance<NativeSelect aria-label="Safety tolerance" className={field} value={settings.safetyTolerance ?? "4"} onChange={e => set({ safetyTolerance: e.target.value as "4" })}>{["1", "2", "3", "4", "5", "6"].map(v => <option key={v} value={v}>{v === "1" ? "1 — strictest" : v === "6" ? "6 — least strict" : v}</option>)}</NativeSelect></label> : null}
      {keys.includes("bitrateMode") ? <label className="grid gap-1 text-xs">Encoding quality<NativeSelect aria-label="Encoding quality" className={field} value={settings.bitrateMode ?? "standard"} onChange={e => set({ bitrateMode: e.target.value as "standard" | "high" })}><option value="standard">Standard</option><option value="high">High — larger file</option></NativeSelect></label> : null}
    </div>
    {keys.includes("enableSafetyChecker") ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.enableSafetyChecker ?? true} onChange={e => set({ enableSafetyChecker: e.target.checked })} />Safety checker</label> : null}
    {keys.includes("autoFix") ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.autoFix ?? false} onChange={e => set({ autoFix: e.target.checked })} />Auto-fix rejected prompts</label> : null}
  </section>;
}

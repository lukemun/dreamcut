"use client";


import { Checkbox } from "@/components/ui/checkbox";
import type { AssetDraft } from "@/lib/generation/assets";
import { getAssetModel, modelSettingKeys } from "@/lib/generation/asset-models";
import { OptionSelect } from "@/components/ui/select";

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
      {keys.includes("promptExpansion") ? <label className="grid gap-1 text-xs">Prompt expansion<OptionSelect label="Prompt expansion" className={field} value={settings.promptExpansion ?? "balanced"} onValueChange={next => set({ promptExpansion: next as "disabled" | "balanced" | "quality" })} options={[{ value: "disabled", label: "Off — keep my prompt" }, { value: "balanced", label: "Balanced (default)" }, { value: "quality", label: "Quality rewrite — slower" }]} /></label> : null}
      {keys.includes("safetyTolerance") ? <label className="grid gap-1 text-xs">Safety tolerance<OptionSelect label="Safety tolerance" className={field} value={settings.safetyTolerance ?? "4"} onValueChange={next => set({ safetyTolerance: next as "4" })} options={["1", "2", "3", "4", "5", "6"].map(v => ({ value: v, label: v === "1" ? "1 — strictest" : v === "6" ? "6 — least strict" : v }))} /></label> : null}
      {keys.includes("bitrateMode") ? <label className="grid gap-1 text-xs">Encoding quality<OptionSelect label="Encoding quality" className={field} value={settings.bitrateMode ?? "standard"} onValueChange={next => set({ bitrateMode: next as "standard" | "high" })} options={[{ value: "standard", label: "Standard" }, { value: "high", label: "High — larger file" }]} /></label> : null}
    </div>
    {keys.includes("enableSafetyChecker") ? <label className="flex items-center gap-2 text-xs"><Checkbox checked={settings.enableSafetyChecker ?? true} onCheckedChange={enableSafetyChecker => set({ enableSafetyChecker })} />Safety checker</label> : null}
    {keys.includes("autoFix") ? <label className="flex items-center gap-2 text-xs"><Checkbox checked={settings.autoFix ?? false} onCheckedChange={autoFix => set({ autoFix })} />Auto-fix rejected prompts</label> : null}
  </section>;
}

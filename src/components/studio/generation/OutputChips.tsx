"use client";

import { useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { ChevronDownIcon, SlidersHorizontalIcon } from "lucide-react";
import { CHIP_TRIGGER, Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import type { AssetDraft } from "@/lib/generation/assets";
import { getAssetModel, modelSettingKeys } from "@/lib/generation/asset-models";

type Option = { value: string; label: string; /** Segment text when the full label is too long for a segment. */ short?: string };
/** One output setting: a choice, an on/off, or a fact the draft settles by itself (from the source, included sound). */
type Setting = { key: string; label: string } & (
  | { kind: "choice"; value: string; options: readonly Option[]; onChange: (value: string) => void }
  | { kind: "toggle"; on: boolean; onLabel: string; offLabel: string; onChange: (on: boolean) => void }
  | { kind: "fact"; value: string });

/** Long length ranges (songs) offer every 15 seconds, keeping the current choice. */
function durationOptions(durations: readonly number[], current: number) {
  if (durations.length <= 40) return durations;
  return [...new Set([...durations.filter(n => n % 15 === 0), ...(durations.includes(current) ? [current] : [])])].sort((a, b) => a - b);
}
const lengthLabel = (n: number) => n < 60 || n % 60 ? `${n}s` : `${n / 60} min`;

/** The settings this draft's model offers, in the order the summary reads them. */
function outputSettings(draft: AssetDraft, update: (patch: Partial<AssetDraft>) => void): Setting[] {
  const model = getAssetModel(draft);
  const image = draft.task === "image" || draft.task === "edit";
  const fromSource = model.roles.includes("source");
  const list: Setting[] = [];
  const sound = draft.task === "music" || draft.task === "speech";
  if (!sound) {
    if (fromSource) list.push({ key: "shape", label: "Shape", kind: "fact", value: "From video" });
    else if (["kling", "motion", "h3"].includes(model.adapter) && draft.references.some(r => r.role === "start")) list.push({ key: "shape", label: "Shape", kind: "fact", value: "From start frame" });
    else list.push({ key: "shape", label: "Shape", kind: "choice", value: draft.aspect, options: model.aspects.map(v => ({ value: v, label: v })), onChange: v => update({ aspect: v as AssetDraft["aspect"] }) });
  }
  if (image) list.push({ key: "count", label: "Images", kind: "choice", value: String(draft.count),
    options: Array.from({ length: model.maxCount }, (_, i) => ({ value: String(i + 1), label: `${i + 1} image${i ? "s" : ""}`, short: String(i + 1) })), onChange: v => update({ count: Number(v) }) });
  else if (model.adapter === "motion") list.push({ key: "orientation", label: "Match", kind: "choice", value: draft.orientation,
    options: [{ value: "video", label: "Like the motion video", short: "Video" }, { value: "image", label: "Like the start frame", short: "Start frame" }], onChange: v => update({ orientation: v as "image" | "video" }) });
  else if (fromSource) list.push({ key: "length", label: "Length", kind: "fact", value: "Video's length" });
  else if (model.speech) list.push({ key: "length", label: "Length", kind: "fact", value: model.speech.promptVoice ? "Up to 2 min" : "Follows the script" });
  else if (!model.durations.length) list.push({ key: "length", label: "Length", kind: "fact", value: "Full song" });
  else list.push({ key: "length", label: "Length", kind: "choice", value: String(draft.duration),
    options: durationOptions(model.durations, draft.duration).map(n => ({ value: String(n), label: lengthLabel(n) })), onChange: v => update({ duration: Number(v) }) });
  if (model.resolutions.length) {
    const quality = model.adapter === "gpt-image" || model.adapter === "speech";
    list.push({ key: "resolution", label: quality ? "Quality" : "Resolution", kind: "choice", value: draft.resolution ?? model.resolutions[0],
      options: model.resolutions.map(v => ({ value: v, label: quality ? `${v[0].toUpperCase()}${v.slice(1)} quality` : v, short: quality ? `${v[0].toUpperCase()}${v.slice(1)}` : undefined })), onChange: v => update({ resolution: v }) });
  } else if (model.kind === "video") list.push({ key: "resolution", label: "Resolution", kind: "fact", value: "Automatic" });
  if (model.adapter === "recast") list.push({ key: "sound", label: "Sound", kind: "fact", value: "Source sound" });
  else if (!image && !sound && model.audio) {
    if (model.audioRequired) list.push({ key: "sound", label: "Sound", kind: "fact", value: model.adapter === "sync3" ? "Your singing audio" : "Sound included" });
    else list.push({ key: "sound", label: model.adapter === "motion" ? "Reference sound" : model.adapter === "o1-edit" ? "Source sound" : "Sound", kind: "toggle", on: draft.audio,
      onLabel: model.adapter === "motion" || model.adapter === "o1-edit" ? "Keep" : "On", offLabel: "Off", onChange: on => update({ audio: on }) });
  }
  return list;
}

const summaryOf = (setting: Setting) => setting.kind === "fact" ? setting.value : setting.kind === "toggle" ? `${setting.label} ${setting.on ? setting.onLabel.toLowerCase() : "off"}`
  : summaryLabel(setting.key, setting.options.find(option => option.value === setting.value)) ?? setting.value;
/** The summary uses short words ("High"), except for the count, where "1 image" says what the number counts. */
const summaryLabel = (key: string, option?: Option) => option && (key === "count" ? option.label : option.short ?? option.label);
/** Segments for a few short options; a list for many or long ones. */
const segmented = (options: readonly Option[]) => options.length <= 4 && options.every(option => (option.short ?? option.label).length <= 11);

function SettingControl({ setting }: { setting: Setting }) {
  if (setting.kind === "fact") return <span className="truncate text-xs text-[var(--ink-muted)]">{setting.value}</span>;
  const options = setting.kind === "toggle" ? [{ value: "on", label: setting.onLabel }, { value: "off", label: setting.offLabel }] : setting.options;
  const value = setting.kind === "toggle" ? setting.on ? "on" : "off" : setting.value;
  const choose = (next: string) => setting.kind === "toggle" ? setting.onChange(next === "on") : setting.onChange(next);
  if (segmented(options)) return <SegmentedControl size="sm" fill role="group" aria-label={setting.label} className="min-w-0 flex-1">
    {options.map(option => <button key={option.value} type="button" aria-pressed={option.value === value} aria-label={option.label} onClick={() => choose(option.value)}>{option.short ?? option.label}</button>)}
  </SegmentedControl>;
  return <Select value={value} onValueChange={next => { if (typeof next === "string") choose(next); }}>
    <SelectTrigger size="sm" aria-label={setting.label} className="min-w-0 flex-1"><span className="truncate">{options.find(option => option.value === value)?.label ?? value}</span></SelectTrigger>
    <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}

/**
 * One settings chip and the model chip at the far right, on one row inside the prompt box. The settings chip reads the current
 * choices (shape, count or length, resolution, sound) and opens them as a short list; More settings opens the
 * model's own settings under the prompt.
 */
export function OutputChips({ draft, update, moreOpen, onMoreChange, leading }: {
  draft: AssetDraft; update: (patch: Partial<AssetDraft>) => void; moreOpen: boolean; onMoreChange: (open: boolean) => void;
  /** The model chip, at the far right of the row. */
  leading?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const settings = outputSettings(draft, update);
  const more = modelSettingKeys(draft).length > 0;
  // The summary names the choices; facts the draft settles by itself (Automatic, From video) show only in the list.
  const summary = settings.filter(setting => setting.kind !== "fact").map(summaryOf).join(" · ");
  return <div role="group" aria-label="Output settings" className="flex min-w-0 items-center gap-1">
    {/* Only facts (a voiceover's length follows its script) leave nothing to choose, so no chip. */}
    {summary || more ? <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger aria-label={`Settings: ${summary}`} className={cn(CHIP_TRIGGER, "min-w-0 shrink")}>
        <SlidersHorizontalIcon aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{summary || "Settings"}</span><ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
      </Popover.Trigger>
      <Popover.Portal>
        {/* Opens upward like the model chip: below the prompt sits Generate, which spends credits. */}
        <Popover.Positioner side="top" align="start" sideOffset={6} collisionPadding={8} className="editor-chrome isolate z-(--layer-popover)">
          <Popover.Popup className="w-[min(300px,calc(100vw-16px))] max-w-[var(--available-width)] space-y-1 overflow-hidden rounded-xl border border-[var(--edge-outline)] bg-[var(--chrome-panel)] p-2 text-[var(--ink)] shadow-xl outline-none">
            {settings.map(setting => <div key={setting.key} className="flex min-h-9 items-center gap-3 px-1">
              <span className="w-16 shrink-0 text-xs text-[var(--ink-secondary)]">{setting.label}</span><SettingControl setting={setting} />
            </div>)}
            {more ? <button type="button" aria-label="More settings" aria-expanded={moreOpen} onClick={() => { onMoreChange(!moreOpen); setOpen(false); }}
              className="flex min-h-8 w-full items-center gap-2 rounded-lg px-1 text-left text-xs text-[var(--ink-secondary)] outline-none hover:text-[var(--ink)] focus-visible:ring-3 focus-visible:ring-[var(--chrome-focus-ring)]/35">
              <SlidersHorizontalIcon aria-hidden="true" className="size-3.5" />{moreOpen ? "Hide more settings" : "More settings"}</button> : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root> : null}
    {leading ? <div className="ml-auto shrink-0">{leading}</div> : null}
  </div>;
}

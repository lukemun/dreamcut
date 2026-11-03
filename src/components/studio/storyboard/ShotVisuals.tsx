"use client";
import { useEffect, useRef, useState } from "react";
import { Maximize, MoreHorizontal, PictureInPicture2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionMenu, ActionMenuItem } from "@/components/ui/menu";
import { MediaGallery } from "@/components/ui/media-gallery";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { motionSubjectFromSourceUrl } from "@/lib/hyperframes/motion-media";
import { thumbnailUrl } from "@/lib/media/thumbnail-url";
import { visualPlacement, type StoryboardAsset, type StoryboardShot, type StoryboardVisual } from "@/lib/storyboard/model";
import { InspectorItemHeader } from "../timeline/InspectorHierarchy";
import { StoryboardCardMedia } from "./StoryboardCardMedia";
import { Seconds } from "./StoryboardSeconds";
import type { useStoryboard } from "./useStoryboard";
import styles from "./storyboard.module.css";

const short = (seconds: number) => `${seconds.toFixed(1)}s`;
const frameDown = (seconds: number) => Math.floor(seconds * 30 + 1e-6) / 30;

function VisualThumb({ asset, visual }: { asset?: StoryboardAsset; visual: StoryboardVisual }) {
  const src = asset ? asset.kind === "video" ? asset.preview && thumbnailUrl(asset.preview, 160, visual.start) : thumbnailUrl(asset.preview || asset.url, 160) : undefined;
  return src ? <img className={styles.visualThumb} src={src} alt="" draggable={false} loading="lazy" decoding="async" /> : <span className={styles.visualThumb} />;
}

/** A rendered motion graphic lays itself out; photos and videos float or cover the frame. */
const isMotionGraphic = (asset?: StoryboardAsset) => !!asset && motionSubjectFromSourceUrl(asset.url)?.kind === "composition";
type Look = "float" | "full" | "motion";
const lookOf = (visual: StoryboardVisual, asset?: StoryboardAsset): Look => isMotionGraphic(asset) ? "motion" : visualPlacement(visual);
const LOOK = { float: { icon: PictureInPicture2, name: "Floating" }, full: { icon: Maximize, name: "Full frame" }, motion: { icon: Sparkles, name: "Motion graphic" } } as const;

/**
 * Script view: the assets this shot uses, as a plain list with when each appears. A brief
 * overview; placement and animation are tuned in the editor after Build timeline.
 */
export function ShotAssetList({ shot, lookup, open }: { shot: StoryboardShot; lookup: (source: string) => StoryboardAsset | undefined; open: (visualId: string) => void }) {
  if (!shot.visuals?.length) return null;
  return <ul className={styles.assetList} aria-label={`Assets in ${shot.label}`} data-no-details>
    {shot.visuals.map(v => {
      const asset = lookup(v.source), look = lookOf(v, asset), Icon = LOOK[look].icon;
      const src = asset ? asset.kind === "video" ? asset.preview && thumbnailUrl(asset.preview, 320, v.start + v.duration * .6) : thumbnailUrl(asset.preview || asset.url, 320) : undefined;
      return <li key={v.id}><button type="button" className={styles.assetItem} onClick={() => open(v.id)} title={`${v.label} · ${LOOK[look].name}`}>
        <span className={styles.assetPicture} data-look={look} data-placement={look === "motion" ? v.placement : undefined}>{src && <img src={src} alt="" draggable={false} loading="lazy" decoding="async" />}</span>
        <span className={styles.assetName}><Icon aria-hidden="true" /><span>{v.label}</span></span>
        <small>{short(v.at)}–{short(v.at + v.duration)}</small>
      </button></li>;
    })}
  </ul>;
}

/** The visuals shown over a shot, in time order, as small labelled thumbnails on the story. */
export function ShotVisualStrip({ shot, lookup, open }: { shot: StoryboardShot; lookup: (source: string) => StoryboardAsset | undefined; open: (visualId: string) => void }) {
  if (!shot.visuals?.length) return null;
  return <ul className={styles.visualStrip} aria-label={`Visuals over ${shot.label}`} data-no-details>
    {shot.visuals.map(v => <li key={v.id}><button type="button" className={styles.visualChip} title={`${v.label} · at ${short(v.at)} for ${short(v.duration)}`}
      aria-label={`Visual ${v.label}, at ${short(v.at)} for ${short(v.duration)}`} onClick={() => open(v.id)}>
      <VisualThumb asset={lookup(v.source)} visual={v} /><span>{v.label}</span><small>{short(v.at)}</small>
    </button></li>)}
  </ul>;
}

/** Shot details: add, retime, rename, reorder and remove the visuals over this shot. */
export function ShotVisualsEditor({ shot, api, lookup, busy, picking, setPicking }: {
  shot: StoryboardShot; api: ReturnType<typeof useStoryboard>; lookup: (source: string) => StoryboardAsset | undefined; busy: boolean;
  picking: boolean; setPicking: (open: boolean) => void;
}) {
  const visuals = shot.visuals ?? [], picker = useRef<HTMLDivElement>(null);
  // After the details panel settles on this shot, bring the picker into view.
  useEffect(() => { if (!picking) return; const timer = setTimeout(() => picker.current?.scrollIntoView({ block: "nearest" }), 60); return () => clearTimeout(timer); }, [picking]);
  const choices = api.assets.filter(a => a.kind !== "audio" && a.ready && a.source !== shot.source);
  return <div className={styles.visualEditor}>
    <InspectorItemHeader title="Visuals over this shot" actions={<Button size="sm" variant="ghost" disabled={busy} aria-expanded={picking} onClick={() => setPicking(!picking)}>{picking ? "Cancel" : <><Plus aria-hidden="true" />Add visual</>}</Button>} />
    {picking && <div ref={picker} className={styles.visualPicker} aria-label="Choose a visual">
      {choices.length ? <MediaGallery targetHeight={72} minCardWidth={72} gap={6}>{choices.map(a => <button key={a.source} type="button" className={styles.visualPick} title={a.name} disabled={busy}
        onClick={() => { void api.addVisual(shot.id, a.source); setPicking(false); }}>
        <StoryboardCardMedia asset={a} playable={false} /><span>{a.name}</span>
      </button>)}</MediaGallery> : <p className={styles.muted}>No prepared photos or videos in this project yet.</p>}
    </div>}
    {visuals.map((v, i) => <VisualRow key={`${v.id}-${v.at}-${v.duration}-${v.start}`} shot={shot} visual={v} index={i} count={visuals.length} asset={lookup(v.source)} busy={busy} api={api} />)}
  </div>;
}

function VisualRow({ shot, visual: v, index, count, asset, busy, api }: { shot: StoryboardShot; visual: StoryboardVisual; index: number; count: number; asset?: StoryboardAsset; busy: boolean; api: ReturnType<typeof useStoryboard> }) {
  const [label, setLabel] = useState(v.label);
  const next = shot.visuals?.[index + 1], previous = shot.visuals?.[index - 1];
  const earliest = previous ? previous.at + previous.duration : 0, latest = (next ? next.at : shot.duration) - v.duration;
  const room = (next ? next.at : shot.duration) - v.at;
  const sourceRoom = asset?.kind === "video" ? (asset.duration ?? 0) - v.start : Infinity;
  const patch = (value: Partial<StoryboardVisual>) => void api.patchVisual(shot.id, v.id, value);
  return <div id={`shot-visual-${v.id}`} className={styles.visualRow}>
    <div className={styles.visualRowHead}>
      <VisualThumb asset={asset} visual={v} />
      <Input aria-label="Visual name" value={label} disabled={busy} maxLength={240} onChange={e => setLabel(e.target.value)} onBlur={() => { if (label.trim() && label !== v.label) patch({ label: label.trim() }); }} />
      <ActionMenu trigger={<Button size="icon-xs" variant="ghost" aria-label={`Visual ${index + 1} actions`}><MoreHorizontal aria-hidden="true" /></Button>}>
        <ActionMenuItem disabled={busy || index === 0} onClick={() => void api.moveVisual(shot.id, v.id, -1)}>Move earlier</ActionMenuItem>
        <ActionMenuItem disabled={busy || index === count - 1} onClick={() => void api.moveVisual(shot.id, v.id, 1)}>Move later</ActionMenuItem>
        <ActionMenuItem disabled={busy} onClick={() => void api.removeVisual(shot.id, v.id)}>Remove visual</ActionMenuItem>
      </ActionMenu>
    </div>
    <Seconds label="Appears at" value={v.at} min={frameDown(Math.max(0, earliest))} max={frameDown(Math.max(earliest, latest))} disabled={busy} commit={at => patch({ at })} />
    <Seconds label="On screen for" value={v.duration} min={1 / 30} max={frameDown(Math.max(1 / 30, Math.min(room, sourceRoom)))} disabled={busy} commit={duration => patch({ duration })} />
    {!isMotionGraphic(asset) && <SegmentedControl size="sm" aria-label="Placement">
      {(["float", "full"] as const).map(key => <button key={key} type="button" disabled={busy} aria-pressed={visualPlacement(v) === key} onClick={() => { if (visualPlacement(v) !== key) patch({ placement: key }); }}>{LOOK[key].name}</button>)}
    </SegmentedControl>}
    {asset?.kind === "video" && <Seconds label="Clip starts at" value={v.start} max={frameDown(Math.max(0, (asset.duration ?? 0) - v.duration))} disabled={busy} commit={start => patch({ start })} />}
  </div>;
}

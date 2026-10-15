"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2Icon, FilmIcon, FolderOpenIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { TIMELINE_ASPECT_RATIOS } from "@/lib/aspect-ratios";
import { PROJECT_FRAME_RATES } from "@/lib/timeline/frame-quantization";
import { EXPORT_RESOLUTIONS, exportOutputSize, exportResolutionLabel, type ExportResolution } from "@/lib/render/export-resolution";
import { coverFromTimeline } from "@/lib/media/project-cover-source";
import { thumbnailUrl } from "@/lib/media/thumbnail-url";

type Props = {
  elements: ReadonlyArray<{ source_url?: string | null; props?: unknown }>;
  aspectRatio: string;
  onAspectRatioChange: (value: string) => void;
  aspectRatioSaving: boolean;
  aspectRatioError: string | null;
  duration: string;
  width: number;
  height: number;
  resolution: ExportResolution;
  onResolutionChange: (value: ExportResolution) => void;
  /** Highest resolution the selected renderer can export. */
  maxResolution?: ExportResolution;
  fps: number;
  /** Saves the project frame rate; picture clips re-snap to the new frame grid. */
  onFrameRateChange?: (value: number) => void;
  renderer: string;
  /** settings → exporting → done or failed. The dialog stays open throughout. */
  phase: ExportPhase;
  /** 0–1 while exporting, when known. */
  progress?: number;
  progressLabel?: string;
  elapsedSeconds: number;
  error?: string | null;
  /** The finished export, shown in place of the cover when done. */
  renderUrl?: string | null;
  fileName?: string | null;
  hasLastRender: boolean;
  onOpenFolder: () => void;
  onExport: () => void;
  onRetry: () => void;
  onClose: () => void;
};

export type ExportPhase = "settings" | "exporting" | "done" | "failed";

const COVER_MAX_HEIGHT = "min(24rem, 32dvh)";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** Export settings: what the video will look like on the left, how it is encoded on the
 * right. The dialog follows the export through to the finished file. */
export function ExportDialog(props: Props) {
  const { onClose } = props;
  const cover = useMemo(() => coverFromTimeline({ elements: props.elements }), [props.elements]);
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Closing returns keyboard focus to whatever opened the dialog (the header's Export button). Read
  // during the first render, before the dialog takes focus.
  const [opener] = useState(() => typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useEffect(() => () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); }, [opener]);
  // Focus starts on the title, never on Export or Try again: the Enter that opened the dialog
  // must not also start an export. Once finished, "Open in folder" takes focus instead.
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (props.phase !== "done") titleRef.current?.focus({ preventScroll: true }); }, [props.phase]);

  const [w, h] = props.aspectRatio.split(":").map(Number);
  const canExport = !props.aspectRatioSaving && !props.aspectRatioError;
  const locked = props.phase !== "settings";
  const title = props.phase === "exporting" ? "Exporting" : props.phase === "done" ? "Export complete" : props.phase === "failed" ? "Export failed" : "Export";
  const percent = props.progress === undefined ? undefined : Math.round(Math.min(1, Math.max(0, props.progress)) * 100);

  return (
    <div className="timeline-export-backdrop fixed inset-0 z-[1300] flex items-center justify-center p-5" onClick={onClose}>
      <div
        className="editor-chrome timeline-export-dialog flex max-h-[min(88vh,44rem)] w-[min(52rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeline-export-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 pt-5">
          <h2 id="timeline-export-title" ref={titleRef} tabIndex={-1} className="text-lg font-semibold text-[var(--ink)] outline-none">{title}</h2>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}><XIcon /></Button>
        </header>

        <div className="grid min-h-0 flex-1 gap-8 overflow-y-auto px-6 py-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <div className="flex items-start justify-center">
            <div
              className="flex w-full items-center justify-center overflow-hidden rounded-xl bg-[var(--chrome-deep)] text-[var(--ink-muted)]"
              // The cover never takes more than a third of a phone's height, so the settings stay in view.
              style={{ aspectRatio: w && h ? `${w} / ${h}` : undefined, maxHeight: COVER_MAX_HEIGHT, maxWidth: w && h && w > h ? "100%" : `calc(${COVER_MAX_HEIGHT} * ${(w || 9) / (h || 16)})` }}
            >
              {props.phase === "done" && props.renderUrl
                ? <video src={props.renderUrl} controls playsInline aria-label="Exported video" className="size-full bg-black object-contain" />
                : cover && !coverFailed
                ? <img src={thumbnailUrl(cover.url, 640)} alt="" className="size-full object-cover" onError={() => setCoverFailed(true)} />
                : <FilmIcon className="size-8" strokeWidth={1.25} aria-hidden="true" />}
            </div>
          </div>

          <section aria-labelledby="export-video-heading" className="min-w-0">
            <h3 id="export-video-heading" className="mb-3 text-sm font-semibold text-[var(--ink)]">Video</h3>
            <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-x-4">
              <Row label="Aspect ratio" htmlFor="export-aspect-ratio">
                <NativeSelect
                  id="export-aspect-ratio"
                  value={props.aspectRatio}
                  disabled={locked || props.aspectRatioSaving}
                  aria-busy={props.aspectRatioSaving}
                  aria-invalid={Boolean(props.aspectRatioError) || undefined}
                  onChange={(event) => props.onAspectRatioChange(event.target.value)}
                >
                  {TIMELINE_ASPECT_RATIOS.map(({ value, label }) => <option key={value} value={value}>{`${label} · ${value}`}</option>)}
                </NativeSelect>
                {props.aspectRatioError && <p role="alert" className="mt-1 text-xs text-[var(--chrome-focus-ring)]">{props.aspectRatioError}</p>}
              </Row>
              <Row label="Resolution" htmlFor="export-resolution">
                <NativeSelect
                  id="export-resolution"
                  value={String(props.resolution)}
                  disabled={locked}
                  onChange={(event) => props.onResolutionChange(Number(event.target.value) as ExportResolution)}
                >
                  {EXPORT_RESOLUTIONS.map((resolution) => {
                    const size = exportOutputSize({ width: props.width, height: props.height }, resolution);
                    return <option key={resolution} value={resolution} disabled={props.maxResolution !== undefined && resolution > props.maxResolution}>{`${exportResolutionLabel(resolution)} · ${size.width} × ${size.height}`}</option>;
                  })}
                </NativeSelect>
              </Row>
              <Row label="Frame rate" htmlFor="export-frame-rate">
                {props.onFrameRateChange ? (
                  <NativeSelect
                    id="export-frame-rate"
                    value={String(props.fps)}
                    disabled={locked || props.aspectRatioSaving}
                    aria-busy={props.aspectRatioSaving}
                    onChange={(event) => props.onFrameRateChange?.(Number(event.target.value))}
                  >
                    {PROJECT_FRAME_RATES.map((rate) => <option key={rate} value={rate}>{`${rate} fps`}</option>)}
                  </NativeSelect>
                ) : <span className="tabular">{`${props.fps} fps`}</span>}
              </Row>
              <Row label="Format">MP4 · H.264</Row>
              <Row label="Renderer">{props.renderer}</Row>
            </dl>
          </section>
        </div>

        <footer className="flex flex-col gap-3 px-6 pb-5">
          {props.phase === "exporting" && (
            <div
              role="progressbar"
              aria-label="Export progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className={`h-1.5 w-full overflow-hidden rounded-full bg-[var(--chrome-deep)]${percent === undefined ? " animate-pulse" : ""}`}
            >
              {/* Before frames begin the bar stays empty; a partly filled placeholder read as progress that then reset. */}
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent ?? 0}%` }} />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="tabular min-w-0 text-sm text-[var(--ink-muted)]" aria-live="polite">
              {props.phase === "exporting" ? `${props.progressLabel ?? "Starting"} · ${clock(props.elapsedSeconds)}`
                : props.phase === "done" ? <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--ink)]"><CheckCircle2Icon className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{props.fileName ?? "Saved"}</span></span>
                : props.phase === "failed" ? <span role="alert" className="text-destructive-foreground">{props.error ?? "The export could not finish."}</span>
                : `Duration ${props.duration}`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {props.phase === "settings" && <>
                {props.hasLastRender && <Button type="button" variant="ghost" onClick={props.onOpenFolder}><FolderOpenIcon data-icon="inline-start" />Open last export</Button>}
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="button" disabled={!canExport} onClick={props.onExport}>Export</Button>
              </>}
              {props.phase === "exporting" && <Button type="button" variant="outline" onClick={onClose}>Keep editing</Button>}
              {props.phase === "done" && <>
                <Button type="button" variant="outline" onClick={onClose}>Done</Button>
                <Button type="button" autoFocus onClick={props.onOpenFolder}><FolderOpenIcon data-icon="inline-start" />Open in folder</Button>
              </>}
              {props.phase === "failed" && <>
                <Button type="button" variant="outline" onClick={onClose}>Close</Button>
                <Button type="button" onClick={props.onRetry}>Try again</Button>
              </>}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return <>
    <dt className="text-[var(--ink-muted)]">{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}</dt>
    <dd className="min-w-0 text-[var(--ink)]">{children}</dd>
  </>;
}

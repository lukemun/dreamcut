"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CrosshairIcon, LoaderCircleIcon, ScissorsIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  cutoutIntervalWithEditableHandles,
} from "./custom-cutout-handles";

type Point = { x: number; y: number };

type Props = {
  projectId: string;
  sourceRelativePath: string;
  sourceUrl: string;
  sourceName: string;
  durationSeconds: number | null;
  initialStartSeconds?: number;
  initialEndSeconds?: number;
  initialPromptSeconds?: number;
  triggerLabel?: string;
  onCreated: () => Promise<void> | void;
};

export function CustomCutoutDialog({
  projectId,
  sourceRelativePath,
  sourceUrl,
  sourceName,
  durationSeconds,
  initialStartSeconds = 0,
  initialEndSeconds,
  initialPromptSeconds,
  triggerLabel = "Cut out",
  onCreated,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(durationSeconds ?? 0);
  const [promptSeconds, setPromptSeconds] = useState(0);
  const [positivePoints, setPositivePoints] = useState<Point[]>([]);
  const [negativePoints, setNegativePoints] = useState<Point[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextDuration = durationSeconds ?? duration;
    const nextStart = Math.max(0, Math.min(nextDuration, initialStartSeconds));
    const nextEnd = Math.max(nextStart, Math.min(nextDuration, initialEndSeconds ?? nextDuration));
    const nextPrompt = Math.max(nextStart, Math.min(nextEnd, initialPromptSeconds ?? (nextStart + nextEnd) / 2));
    setStartSeconds(nextStart);
    setEndSeconds(nextEnd);
    setPromptSeconds(nextPrompt);
    setPositivePoints([]);
    setNegativePoints([]);
    setError(null);
  }, [duration, durationSeconds, initialEndSeconds, initialPromptSeconds, initialStartSeconds, open]);

  const seekToPrompt = (seconds: number) => {
    const bounded = Math.max(0, Math.min(duration || seconds, seconds));
    setPromptSeconds(bounded);
    if (videoRef.current) videoRef.current.currentTime = bounded;
  };

  const handleLoadedMetadata = () => {
    const nextDuration = videoRef.current?.duration ?? 0;
    if (!(nextDuration > 0)) return;
    setDuration(nextDuration);
    setEndSeconds((current) => current > 0 ? Math.min(current, nextDuration) : nextDuration);
    const nextPrompt = promptSeconds > 0 ? Math.min(promptSeconds, nextDuration) : nextDuration / 2;
    seekToPrompt(nextPrompt);
  };

  const handlePromptClick = (event: MouseEvent<HTMLDivElement>) => {
    if (busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
    if (event.shiftKey) setNegativePoints((current) => [...current, point].slice(-16));
    else setPositivePoints((current) => [...current, point].slice(-16));
  };

  const createCutout = async () => {
    setBusy(true);
    setError(null);
    try {
      const handledInterval = cutoutIntervalWithEditableHandles({
        visibleStartSeconds: startSeconds,
        visibleEndSeconds: endSeconds,
        sourceDurationSeconds: duration,
      });
      const response = await fetch(`/api/projects/${projectId}/analysis/custom-cutout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_relative_path: sourceRelativePath,
          start_seconds: handledInterval.startSeconds,
          end_seconds: handledInterval.endSeconds,
          prompt_seconds: promptSeconds,
          positive_points: positivePoints,
          negative_points: negativePoints,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Custom cutout failed");
      await onCreated();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Custom cutout failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!busy) setOpen(nextOpen); }}>
      <Dialog.Trigger
        render={<Button variant="outline" size="sm" />}
        className="border-white/20 bg-white/6 text-[var(--ink-secondary)] hover:bg-white/10 hover:text-[var(--ink)]"
      >
        <ScissorsIcon data-icon="inline-start" />
        {triggerLabel}
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[1190] bg-black/80 backdrop-blur-[4px] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Viewport className="editor-chrome fixed inset-0 z-[1200] grid place-items-center overflow-y-auto p-4">
          <Dialog.Popup className="my-auto flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-[var(--chrome-line-strong)] bg-[var(--chrome-panel)] text-[var(--ink)] shadow-[0_24px_80px_rgba(0,0,0,0.8)] outline-none ring-1 ring-black/60">
            <header className="flex items-start justify-between gap-5 border-b border-[var(--chrome-line)] px-6 py-5">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-xl font-bold leading-tight">Custom cutout</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
                  {sourceName}
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close custom cutout"
                render={<Button variant="ghost" size="icon" />}
                disabled={busy}
                className="shrink-0 text-[var(--ink-muted)] hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)]"
              >
                <XIcon aria-hidden="true" />
              </Dialog.Close>
            </header>

            <div className="grid gap-5 overflow-y-auto px-6 py-5">
              <div
                className="relative mx-auto w-full max-w-[420px] cursor-crosshair overflow-hidden rounded-lg border border-[var(--chrome-line-strong)] bg-black"
                onClick={handlePromptClick}
              >
                <video
                  ref={videoRef}
                  src={sourceUrl}
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={handleLoadedMetadata}
                  className="block h-auto w-full"
                />
                {[...positivePoints.map((point) => ({ ...point, kind: "positive" as const })), ...negativePoints.map((point) => ({ ...point, kind: "negative" as const }))].map((point, index) => (
                  <span
                    key={`${point.kind}-${index}`}
                    aria-hidden="true"
                    className={point.kind === "positive"
                      ? "pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-lg"
                      : "pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-destructive shadow-lg"}
                    style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  />
                ))}
              </div>

              <div className="grid gap-3 rounded-lg border border-[var(--chrome-line)] bg-[var(--chrome-deep)] p-4 sm:grid-cols-3">
                <label className="grid gap-1.5 text-sm font-semibold text-[var(--ink)]">
                  From (seconds)
                  <Input
                    type="number"
                    min={0}
                    max={endSeconds}
                    step={0.01}
                    value={startSeconds}
                    onChange={(event) => setStartSeconds(Number(event.target.value))}
                    disabled={busy}
                    className="border-[var(--chrome-line-strong)] bg-[var(--chrome-raised)] text-[var(--ink)]"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[var(--ink)]">
                  To (seconds)
                  <Input
                    type="number"
                    min={startSeconds}
                    max={duration}
                    step={0.01}
                    value={endSeconds}
                    onChange={(event) => setEndSeconds(Number(event.target.value))}
                    disabled={busy}
                    className="border-[var(--chrome-line-strong)] bg-[var(--chrome-raised)] text-[var(--ink)]"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[var(--ink)]">
                  Prompt frame (seconds)
                  <Input
                    type="number"
                    min={startSeconds}
                    max={endSeconds}
                    step={0.01}
                    value={promptSeconds}
                    onChange={(event) => seekToPrompt(Number(event.target.value))}
                    disabled={busy}
                    className="border-[var(--chrome-line-strong)] bg-[var(--chrome-raised)] text-[var(--ink)]"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm leading-6 text-[var(--ink-muted)]">
                <CrosshairIcon aria-hidden="true" />
                <span>{positivePoints.length} object point{positivePoints.length === 1 ? "" : "s"} · {negativePoints.length} background exclusion{negativePoints.length === 1 ? "" : "s"}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy || (positivePoints.length === 0 && negativePoints.length === 0)}
                  onClick={() => { setPositivePoints([]); setNegativePoints([]); }}
                >
                  Clear points
                </Button>
              </div>

              {error ? (
                <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">
                  {error}
                </div>
              ) : null}
            </div>

            <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--chrome-line)] px-6 py-4">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" disabled={busy || positivePoints.length === 0 || !(endSeconds > startSeconds)} onClick={() => void createCutout()}>
                {busy ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <ScissorsIcon data-icon="inline-start" />}
                {busy ? "Tracking object…" : "Create cutout"}
              </Button>
            </footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

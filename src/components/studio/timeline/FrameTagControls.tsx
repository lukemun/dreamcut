"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookmarkPlus, ChevronUp, Crosshair, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/components/studio/timeline/adapters";
import { frameTagPoints, type FrameTag } from "@/lib/review/frame-tag-types";

type Props = {
  tags: Array<Pick<FrameTag, "id" | "label" | "timeline_seconds" | "note" | "point" | "points">>;
  busy: boolean;
  onAdd: () => void;
  onStartPointMark?: () => void;
  pointMarkActive?: boolean;
  /** The mark id lets hosts with several media (Generate) seek the right one. */
  onSeek: (seconds: number, tagId?: string) => void;
  onRemove: (tagId: string) => void;
  onClear: () => void;
  onUpdate?: (id: string, patch: { note?: string }) => void;
  /** @deprecated Marks controls are quiet ghost glyphs; kept for existing callers. */
  outlineButtonClassName?: string;
  ghostButtonClassName: string;
  /** Host wording; defaults describe the editor timeline. */
  addLabel?: string;
  pointLabel?: string;
};

export function FrameTagControls({
  tags,
  busy,
  onAdd,
  onStartPointMark,
  pointMarkActive,
  onSeek,
  onRemove,
  onUpdate,
  onClear,
  ghostButtonClassName,
  addLabel = "Timeline mark (M)",
  pointLabel = "Video mark — select a point on the viewer",
}: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const [panelLeft, setPanelLeft] = useState(8);
  const [panelWidth, setPanelWidth] = useState(360);
  const [panelBottom, setPanelBottom] = useState(68);
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = groupRef.current?.getBoundingClientRect();
      const dock = groupRef.current?.closest(".project-review-dock")?.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24, dock ? dock.width - 20 : 360);
      setPanelWidth(width);
      setPanelLeft(dock ? dock.left + 10 : Math.max(12, Math.min(window.innerWidth - width - 12, rect?.left ?? 12)));
      setPanelBottom(Math.max(8, window.innerHeight - (rect?.top ?? window.innerHeight - 60) + 8));
    };
    update(); window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  const clearAndClose = () => {
    onClear();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <style>{`.timeline-review-controls-group {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  background: var(--glass-control);
}
.timeline-review-controls-group > button {
  height: 32px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  box-shadow: none;
}
.timeline-review-controls-group > button:hover,
.timeline-review-controls-group > button[aria-expanded="true"],
.timeline-review-controls-group > button[aria-pressed="true"] { background: var(--glass-raised, rgb(255 255 255 / 8%)); }
.timeline-review-controls-group > button + button { position: relative; }
.timeline-review-controls-group > button + button::before { content: ""; position: absolute; left: -2px; top: 8px; bottom: 8px; width: 1px; background: var(--chrome-line-strong); pointer-events: none; }
.timeline-marks-count { display: inline-flex; align-items: center; justify-content: center; min-width: calc(18px + var(--ui-text-step)); height: calc(18px + var(--ui-text-step)); padding: 0 4px; border-radius: 5px; background: color-mix(in srgb, var(--timeline-review-marker-color) 18%, transparent); font-size: var(--ui-text-small); font-weight: 600; font-variant-numeric: tabular-nums; color: var(--timeline-review-marker-color); }
.timeline-review-controls-group .timeline-marks-chevron { width: 12px; height: 12px; margin-left: 3px; color: var(--ink-muted); }
.timeline-review-controls-group button:focus-visible { position: relative; z-index: 1; outline: 2px solid var(--chrome-focus-ring); outline-offset: -3px; }
`}</style>
      <div ref={groupRef} className="timeline-review-controls-group" role="group" aria-label="Review marks">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onAdd}
            disabled={busy}
            title={addLabel}
            aria-label={addLabel}
            className={ghostButtonClassName}
            style={{
              height: 32,
              width: 32,
              color: "var(--timeline-review-marker-color)",
            }}
          >
            <BookmarkPlus aria-hidden="true" />
          </Button>
          {onStartPointMark && <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onStartPointMark}
            disabled={busy}
            aria-label={pointMarkActive ? "Cancel point marking" : pointLabel}
            aria-pressed={pointMarkActive}
            title={pointMarkActive ? "Cancel point marking" : pointLabel}
            className={ghostButtonClassName}
            style={{ width: 32, height: 32, color: "var(--timeline-review-marker-color)" }}
          >
            <Crosshair aria-hidden="true" />
          </Button>}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen((value) => !value);
          }}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`Marks (${tags.length})`}
          title="Show marked frames"
          className={`${ghostButtonClassName} timeline-marks-button`}
          style={{ height: 32, fontSize: "var(--ui-text-body)", paddingInline: "0.65rem" }}
        >
          <span className="timeline-marks-label">Marks</span>
          <span className="timeline-marks-count" aria-hidden="true">{tags.length}</span>
          <ChevronUp className="timeline-marks-chevron" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }} />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={clearAndClose} disabled={busy || tags.length === 0} aria-label="Clear all marks" title="Clear all marks" className={`${ghostButtonClassName} timeline-marks-clear`} style={{width:28,height:28,color:"var(--destructive)"}}><Trash2 aria-hidden="true" size={14}/></Button>
      </div>

      {open ? createPortal(
        <section
          className="editor-chrome"
          id={panelId}
          aria-label="Marked timeline frames"
          style={{
            position: "fixed",
            left: panelLeft,
            bottom: panelBottom,
            zIndex: 1300,
            width: panelWidth,
            maxHeight: `min(520px, calc(100vh - ${panelBottom + 16}px))`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            border: "1px solid var(--chrome-line-strong)",
            borderRadius: 10,
            background: "var(--glass-panel)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            color: "var(--ink)",
            boxShadow: "0 18px 48px rgb(53 84 125 / 22%)",
          }}
        >
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px 0" }}>
            <span style={{ marginRight: "auto", fontSize: "var(--ui-text-small)", fontWeight: 600 }}>Marks</span>

            <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} title="Close marks" className={ghostButtonClassName}>
              <X aria-hidden="true" />
            </Button>
          </header>
          <div style={{ overflowY: "auto", padding: tags.length > 0 ? 8 : 16 }}>
            {tags.length === 0 ? (
              <p style={{ margin: 0, fontSize: "var(--ui-text-body)", lineHeight: 1.45, color: "var(--ink-muted)" }}>
                No marks yet. Move the playhead and choose Mark.
              </p>
            ) : tags.map((tag) => (
              <div
                key={tag.id}
                style={{ display: "grid", gridTemplateColumns: "1fr 36px", alignItems: "center", gap: 4 }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onSeek(tag.timeline_seconds, tag.id);
                  }}
                  className={ghostButtonClassName}
                  style={{ height: 44, justifyContent: "flex-start", paddingInline: 10 }}
                >
                  <span style={{ width: 38, fontWeight: 800, color: "var(--timeline-review-marker-color)" }}>{tag.label}</span>
                  <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "var(--ui-text-body)", color: "var(--ink)" }}>
                    {formatTime(tag.timeline_seconds, 2)}
                  </span>
                  {frameTagPoints(tag).length > 0 ? (
                    <span
                      aria-label={`${frameTagPoints(tag).length} marked points`}
                      style={{
                        marginLeft: "auto",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        color: "var(--timeline-review-marker-color)",
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: "var(--ui-text-small)",
                      }}
                    >
                      <Crosshair aria-hidden="true" size={14} />
                      {frameTagPoints(tag).length}
                    </span>
                  ) : null}
                </Button>
                {/* A note tells the agent what to change at this mark; it saves on blur. */}
                {onUpdate ? <div style={{ gridColumn: "1 / -1", padding: "0 8px 8px" }}>
                  <Input key={`${tag.id}:${tag.note ?? ""}`} aria-label={`Note for ${tag.label}`} defaultValue={tag.note ?? ""} placeholder="Add a note…" maxLength={1000}
                    onBlur={event => { if (event.target.value !== (tag.note ?? "")) onUpdate(tag.id, { note: event.target.value }); }}
                    onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
                </div> : tag.note && <p style={{gridColumn:"1 / -1",margin:0,padding:"0 10px 8px",fontSize: "var(--ui-text-small)",color:"var(--ink-muted)"}}>{tag.note}</p>}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(tag.id)}
                  disabled={busy}
                  aria-label={`Remove ${tag.label}`}
                  title={`Remove ${tag.label}`}
                  className={ghostButtonClassName}
                  style={{ width: 36, height: 36, gridColumn: 2, gridRow: 1, color: "var(--destructive)" }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

        </section>, groupRef.current?.closest('[role="dialog"]') ?? document.body
      ) : null}
    </>
  );
}

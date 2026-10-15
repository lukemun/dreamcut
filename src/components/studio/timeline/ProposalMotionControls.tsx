"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { LoadingDots } from "@/components/ui/loading-dots";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";

import { groupControlLabels } from "./control-label-groups";
import { InspectorItemHeader } from "./InspectorHierarchy";
import { ProposalAdvancedGroup } from "./ProposalAdvancedAdjustments";
import { SliderScrubControl } from "./InspectorNumericControls";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { ProposalColorInput } from "./ProposalAdjustments";
import { motionControlTiers } from "./proposal-motion-groups";
import type { MotionRenderStatus, ProposalMotionControl, ProposalMotionItem, TimelineClient } from "./timeline-client";

type Values = Record<string, string | number | boolean>;
type Status = { state: "idle" } | { state: "rendering" } | { state: "failed"; message: string };

const POLL_MS = 1_500;
/** A color picker emits continuously while dragging; render once it settles. */
const COLOR_SETTLE_MS = 600;

/** A few short named options read best side by side; more, or long names, use a list (editor-controls.md).
 * The budget is the names' total length, which is what has to fit across a narrow drawer. */
const SEGMENTED_MAX_OPTIONS = 4;
const SEGMENTED_MAX_CHARACTERS = 26;

/** An option named after a text control shows that control's current words. */
export function choiceOptionLabels(control: Extract<ProposalMotionControl, { kind: "choice" }>, controls: readonly ProposalMotionControl[], values: Values) {
  return control.options.map((option) => {
    if (!option.label_from) return option.label;
    const source = controls.find((candidate) => candidate.id === option.label_from);
    const words = String(values[option.label_from] ?? source?.default ?? "").trim();
    return words || option.label;
  });
}

function displayName(id: string): string {
  const words = id.replace(/[._-]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : id;
}

/**
 * The model-declared controls of a proposed motion graphic. A committed change renders
 * the composition with those values in the background, then swaps the proposed clip to
 * that render through the ordinary review override, so preview and Apply agree.
 */
export function ProposalMotionControls({ item, title, proposalId, elementId, client, disabled, renderedUrl, onRendered, onBusyChange, mainControls }: {
  item: ProposalMotionItem;
  /** The agent's main dials for this change; the rest sit in Advanced. */
  mainControls?: readonly string[];
  /** The clip's name as the creator sees it on the timeline; falls back to the composition id. */
  title?: string;
  /** The proposal card passes its proposal; Properties passes the placed clip instead. */
  proposalId?: string;
  elementId?: string;
  client: Pick<TimelineClient, "renderMotionValues" | "motionRenderStatus">;
  disabled: boolean;
  /** The render currently chosen for this clip, or undefined for the proposal's own render. */
  renderedUrl: string | undefined;
  onRendered: (sourceUrl: string | undefined, durationSeconds?: number) => void;
  /** Lets the card hold Apply while a control change is still rendering. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const name = title?.trim() || displayName(item.id);
  const authored = item.values ?? {};
  const chosen = (renderedUrl && item.renders?.find((render) => render.source_url === renderedUrl)?.values) || authored;
  const [values, setValues] = useState<Values>(chosen);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const committed = useRef<Values>(chosen);
  const colorTimer = useRef<number | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const queued = useRef<Values | null>(null);
  useEffect(() => {
    // Development mounts effects twice; re-arm on every mount, not only the first.
    alive.current = true;
    return () => {
      alive.current = false;
      if (colorTimer.current != null) window.clearTimeout(colorTimer.current);
    };
  }, []);
  useEffect(() => onBusyChange?.(status.state === "rendering"), [onBusyChange, status.state]);

  const tiers = motionControlTiers(item.controls ?? [], [item], mainControls);
  if (!tiers.main.length && !tiers.advanced.length) return null;

  async function settle(result: MotionRenderStatus, next: Values): Promise<void> {
    let current = result;
    while (alive.current && (current.state === "rendering" || current.state === "preparing_preview")) {
      await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
      current = await client.motionRenderStatus(item.id, result.job_key);
    }
    if (!alive.current) return;
    if (current.state === "ready") {
      committed.current = next;
      setStatus({ state: "idle" });
      onRendered(current.source_url === item.source_url ? undefined : current.source_url, current.duration_seconds);
    } else if (current.state === "failed") {
      setStatus({ state: "failed", message: current.error ?? "The motion graphic could not be updated" });
    }
  }

  async function render(next: Values) {
    const changed = Object.keys(next).some((key) => next[key] !== committed.current[key]);
    if (!changed) return;
    // Enter then blur, or a slider commit during a render, queue the latest values instead of colliding.
    if (inFlight.current) {
      queued.current = next;
      return;
    }
    inFlight.current = true;
    setStatus({ state: "rendering" });
    try {
      const result = await client.renderMotionValues(item.id, {
        values: next,
        previous_values: committed.current,
        ...(item.source_fingerprint_sha256 ? { expected_source_fingerprint: item.source_fingerprint_sha256 } : {}),
        ...(proposalId ? { proposal_id: proposalId } : {}),
        ...(elementId ? { element_id: elementId } : {}),
      });
      await settle(result, next);
    } catch (error) {
      if (alive.current) setStatus({ state: "failed", message: error instanceof Error ? error.message : "The motion graphic could not be updated" });
    } finally {
      inFlight.current = false;
      const pending = queued.current;
      queued.current = null;
      if (pending && alive.current) void render(pending);
    }
  }

  const update = (control: ProposalMotionControl, value: string | number | boolean, commit: boolean) => {
    const next = { ...values, [control.id]: value };
    setValues(next);
    if (commit) void render(next);
  };
  const reset = (control: ProposalMotionControl) => {
    const original = authored[control.id] ?? control.default;
    update(control, original, true);
  };
  const busy = disabled || status.state === "rendering";
  const fields = (controls: ProposalMotionControl[]) => (
    <MotionControlFields controls={controls} allControls={item.controls} values={values} authored={authored} name={name} fieldPrefix={item.id} busy={busy}
      onChange={update} onReset={reset} onRender={() => void render(values)} onCancel={() => setValues(committed.current)}
      onColorSettle={(control, value) => {
        const next = { ...values, [control.id]: value };
        if (colorTimer.current != null) window.clearTimeout(colorTimer.current);
        colorTimer.current = window.setTimeout(() => void render(next), COLOR_SETTLE_MS);
      }} />
  );

  return (
    <div className="mt-3 grid min-w-0 gap-1.5" data-proposal-motion={item.id}>
      <InspectorItemHeader
        title={name}
        actions={status.state === "rendering"
          ? <span role="status" className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)]">Updating <LoadingDots /></span>
          : renderedUrl ? <span className="text-sm text-[var(--ink-muted)]">Updated</span> : null}
      />
      {tiers.main.length ? fields(tiers.main) : null}
      <ProposalAdvancedGroup id={`motion:${item.id}:${item.operation_index}`} order={1 + item.operation_index} count={tiers.advanced.length} heading={name}>
        {fields(tiers.advanced)}
      </ProposalAdvancedGroup>
      {status.state === "failed" ? <p role="alert" className="m-0 text-sm text-[var(--editor-destructive-ink)]">{status.message}</p> : null}
    </div>
  );
}

/** One composition's control fields; the single-clip and multi-clip panels share them. */
export function MotionControlFields({ controls, allControls, values, authored, name, fieldPrefix, busy, onChange: update, onReset, onRender, onCancel, onColorSettle }: {
  controls: ProposalMotionControl[];
  /** Every control of the graphic, when `controls` is a subset; options named after other fields read them here. */
  allControls?: ProposalMotionControl[];
  values: Values;
  authored: Values;
  /** Who the fields belong to, for each field's accessible name. */
  name: string;
  fieldPrefix: string;
  busy: boolean;
  onChange: (control: ProposalMotionControl, value: string | number | boolean, commit: boolean) => void;
  onReset: (control: ProposalMotionControl) => void;
  /** Commit the typed text. */
  onRender: () => void;
  onCancel: () => void;
  /** A color picker emits continuously; the owner renders once it settles. */
  onColorSettle: (control: ProposalMotionControl, value: string) => void;
}) {
  const labels = groupControlLabels(controls.map((control) => control.label));
  return (
    <>
      {controls.map((control, index) => {
        const value = values[control.id] ?? control.default;
        const { group, label } = labels[index]!;
        const groupStarts = group !== null && labels[index - 1]?.group !== group;
        const changed = value !== (authored[control.id] ?? control.default);
        const subject = `${control.label} for ${name}`;
        return (
          <div key={control.id} data-proposal-control={`motion:${control.id}`}>
            {groupStarts ? <InspectorItemHeader title={group} /> : null}
            <InspectorPropertyControl fields={`motion:${fieldPrefix}:${control.id}`} label={label} density="compact" disabled={!changed || busy} onReset={() => onReset(control)}>
              {control.kind === "number" ? (
                <SliderScrubControl
                  label={subject}
                  value={String(value)}
                  fallback={Number(value)}
                  min={control.min}
                  max={control.max}
                  step={control.step ?? (control.max - control.min) / 100}
                  unit={control.unit ? ` ${control.unit}` : ""}
                  density="compact"
                  disabled={busy}
                  onChange={(raw) => {
                    const number = Number(raw);
                    if (Number.isFinite(number)) update(control, Math.max(control.min, Math.min(control.max, number)), false);
                  }}
                  onCommit={(raw) => {
                    const number = Number(raw);
                    if (Number.isFinite(number)) update(control, Math.max(control.min, Math.min(control.max, number)), true);
                  }}
                  onCancel={onCancel}
                />
              ) : control.kind === "text" ? (
                <Input
                  aria-label={subject}
                  value={String(value)}
                  maxLength={control.max_length}
                  disabled={busy}
                  className="h-8 min-w-0 flex-1"
                  onChange={(event) => update(control, event.target.value, false)}
                  onBlur={onRender}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onRender();
                    if (event.key === "Escape") onCancel();
                  }}
                />
              ) : control.kind === "color" ? (
                <>
                  <input
                    type="color"
                    aria-label={subject}
                    value={String(value)}
                    disabled={busy}
                    className="h-8 w-12"
                    onChange={(event) => {
                      update(control, event.target.value, false);
                      onColorSettle(control, event.target.value);
                    }}
                  />
                  <ProposalColorInput value={String(value)} label={subject} onChange={(next) => update(control, next.toLowerCase(), true)} />
                </>
              ) : control.kind === "choice" ? (() => {
                const optionLabels = choiceOptionLabels(control, allControls ?? controls, values);
                return optionLabels.length <= SEGMENTED_MAX_OPTIONS && optionLabels.join("").length <= SEGMENTED_MAX_CHARACTERS ? (
                  <SegmentedControl size="sm" fill role="group" aria-label={subject} className="min-w-0 flex-1">
                    {control.options.map((option, optionIndex) => (
                      <button key={option.value} type="button" aria-pressed={String(value) === option.value} disabled={busy}
                        onClick={() => { if (String(value) !== option.value) update(control, option.value, true); }}>
                        <span>{optionLabels[optionIndex]}</span>
                      </button>
                    ))}
                  </SegmentedControl>
                ) : (
                  <NativeSelect aria-label={subject} value={String(value)} disabled={busy} onChange={(event) => update(control, event.target.value, true)}>
                    {control.options.map((option, optionIndex) => <option key={option.value} value={option.value}>{optionLabels[optionIndex]}</option>)}
                  </NativeSelect>
                );
              })() : (
                // A yes/no is a checkbox, never a two-option list (editor-controls.md).
                <input type="checkbox" aria-label={subject} checked={Boolean(value)} disabled={busy} className="size-4 accent-[var(--proposal-apply)]"
                  onChange={(event) => update(control, event.target.checked, true)} />
              )}
            </InspectorPropertyControl>
          </div>
        );
      })}
    </>
  );
}

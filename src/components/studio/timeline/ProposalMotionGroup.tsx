"use client";

import { useEffect, useRef, useState } from "react";

import { LoadingDots } from "@/components/ui/loading-dots";
import { applyControlResets } from "@/lib/hyperframes/control-resets";

import { InspectorItemHeader } from "./InspectorHierarchy";
import { ProposalAdvancedGroup } from "./ProposalAdvancedAdjustments";
import { MotionControlFields } from "./ProposalMotionControls";
import { motionControlTiers, splitSharedControls } from "./proposal-motion-groups";
import type { MotionRenderStatus, ProposalMotionControl, ProposalMotionItem, TimelineClient } from "./timeline-client";

type Values = Record<string, string | number | boolean>;

const POLL_MS = 1_500;
const COLOR_SETTLE_MS = 600;

export type MotionGroupMember = {
  item: ProposalMotionItem;
  /** The clip's name on the timeline, e.g. "Section: Thesis". */
  title: string;
  renderedUrl: string | undefined;
  onRendered: (sourceUrl: string | undefined) => void;
};

/**
 * Several clips on one card that use the same motion graphic. The server renders one
 * graphic at a time, so changes queue and render copy by copy; each finished render swaps
 * that clip through the ordinary review override, so preview and Apply agree.
 */
export function ProposalMotionGroup({ members, proposalId, client, disabled, onBusyChange, mainControls }: {
  members: MotionGroupMember[];
  /** The agent's main dials for this change; the rest sit in Advanced. */
  mainControls?: readonly string[];
  proposalId: string;
  client: Pick<TimelineClient, "renderMotionValues" | "motionRenderStatus">;
  disabled: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const controls = members[0]?.item.controls ?? [];
  const authored = members.map(({ item }) => item.values ?? {});
  const [tiers] = useState(() => {
    const { main, advanced } = motionControlTiers(controls, members.map(({ item }) => item), mainControls);
    return { main: splitSharedControls(main, authored), advanced: splitSharedControls(advanced, authored) };
  });
  const [values, setValues] = useState<Values[]>(() => members.map(({ item, renderedUrl }) =>
    (renderedUrl && item.renders?.find((render) => render.source_url === renderedUrl)?.values) || item.values || {}));
  const committed = useRef<Values[]>(values);
  const queue = useRef<Map<number, Values>>(new Map());
  const running = useRef(false);
  const alive = useRef(true);
  const colorTimer = useRef<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (colorTimer.current != null) window.clearTimeout(colorTimer.current); };
  }, []);
  useEffect(() => onBusyChange?.(progress != null), [onBusyChange, progress]);

  async function settle(id: string, result: MotionRenderStatus) {
    let current = result;
    while (alive.current && (current.state === "rendering" || current.state === "preparing_preview")) {
      await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
      current = await client.motionRenderStatus(id, result.job_key);
    }
    return current;
  }

  /** One copy's render; each copy is swapped in as soon as its own render is ready. */
  async function renderCopy(index: number, next: Values) {
    const { item, onRendered } = members[index]!;
    const result = await client.renderMotionValues(item.id, {
      values: next,
      previous_values: committed.current[index]!,
      ...(item.source_fingerprint_sha256 ? { expected_source_fingerprint: item.source_fingerprint_sha256 } : {}),
      proposal_id: proposalId,
    });
    const final = await settle(item.id, result);
    if (!alive.current) return;
    if (final.state !== "ready") throw new Error(final.state === "failed" ? final.error ?? "A card could not be updated" : "A card could not be updated");
    committed.current = committed.current.map((values, i) => i === index ? next : values);
    onRendered(final.source_url === item.source_url ? undefined : final.source_url);
  }

  // Copies render side by side (each set of values is its own server job), so three headers
  // take about as long as one; a change made meanwhile queues and starts when this round ends.
  async function drain() {
    if (running.current) return;
    running.current = true;
    try {
      while (alive.current && queue.current.size) {
        const round = [...queue.current.entries()];
        queue.current.clear();
        let done = 0;
        setProgress({ done, total: round.length });
        const results = await Promise.allSettled(round.map(([index, next]) => renderCopy(index, next).then(() => {
          done += 1;
          if (alive.current) setProgress({ done: Math.min(done, round.length - 1), total: round.length });
        })));
        const failed = results.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
        if (failed) throw failed.reason;
      }
    } catch (error) {
      if (alive.current) setFailure(error instanceof Error ? error.message : "A card could not be updated");
    } finally {
      running.current = false;
      if (alive.current) setProgress(null);
    }
  }

  function commit(next: Values[]) {
    setFailure(null);
    next.forEach((copy, index) => {
      if (Object.keys(copy).some((key) => copy[key] !== committed.current[index]![key])) queue.current.set(index, copy);
    });
    void drain();
  }

  const setShared = (control: ProposalMotionControl, value: string | number | boolean, render: boolean) => {
    const next = values.map((copy) => applyControlResets(controls, copy, { ...copy, [control.id]: value }));
    setValues(next);
    if (render) commit(next);
  };
  const setOwn = (index: number) => (control: ProposalMotionControl, value: string | number | boolean, render: boolean) => {
    const next = values.map((copy, i) => i === index ? applyControlResets(members[i]?.item.controls ?? controls, copy, { ...copy, [control.id]: value }) : copy);
    setValues(next);
    if (render) commit(next);
  };
  const busy = disabled || progress != null;
  const settleColor = (apply: (control: ProposalMotionControl, value: string, render: boolean) => void) => (control: ProposalMotionControl, value: string) => {
    if (colorTimer.current != null) window.clearTimeout(colorTimer.current);
    colorTimer.current = window.setTimeout(() => apply(control, value, true), COLOR_SETTLE_MS);
  };
  const count = members.length;
  // Progress shows on the first heading the card draws.
  const tier = ({ shared, own }: { shared: ProposalMotionControl[]; own: ProposalMotionControl[] }, first: boolean) => (
    <>
      {shared.length ? (
        <>
          <InspectorItemHeader
            title={`All ${count} cards`}
            actions={first && progress ? <span role="status" className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)]">Updating {progress.done + 1} of {progress.total} <LoadingDots /></span> : null}
          />
          <MotionControlFields controls={shared} allControls={controls} values={values[0] ?? {}} authored={authored[0] ?? {}} name={`all ${count} cards`} fieldPrefix={`${members[0]!.item.id}:all`} busy={busy}
            onChange={setShared} onReset={(control) => setShared(control, authored[0]?.[control.id] ?? control.default, true)}
            onRender={() => commit(values)} onCancel={() => setValues(committed.current)} onColorSettle={settleColor(setShared)} />
        </>
      ) : null}
      {own.length ? members.map((member, index) => (
        <div key={`${member.item.operation_index}`} className="grid min-w-0 gap-1.5" data-proposal-motion-member={member.item.operation_index}>
          <InspectorItemHeader title={member.title} actions={member.renderedUrl ? <span className="text-sm text-[var(--ink-muted)]">Updated</span> : null} />
          <MotionControlFields controls={own} allControls={controls} values={values[index] ?? {}} authored={authored[index] ?? {}} name={member.title} fieldPrefix={`${member.item.id}:${member.item.operation_index}`} busy={busy}
            onChange={setOwn(index)} onReset={(control) => setOwn(index)(control, authored[index]?.[control.id] ?? control.default, true)}
            onRender={() => commit(values)} onCancel={() => setValues(committed.current)} onColorSettle={settleColor(setOwn(index))} />
        </div>
      )) : null}
    </>
  );

  return (
    <div className="mt-3 grid min-w-0 gap-1.5" data-proposal-motion-group={members[0]?.item.id}>
      {progress && !tiers.main.shared.length ? <span role="status" className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)]">Updating {progress.done + 1} of {progress.total} <LoadingDots /></span> : null}
      {tier(tiers.main, true)}
      <ProposalAdvancedGroup id={`motion-group:${members[0]?.item.id}:${members[0]?.item.operation_index}`} order={1 + (members[0]?.item.operation_index ?? 0)} count={tiers.advanced.shared.length + tiers.advanced.own.length}>
        {tier(tiers.advanced, false)}
      </ProposalAdvancedGroup>
      {failure ? <p role="alert" className="m-0 text-sm text-[var(--editor-destructive-ink)]">{failure}</p> : null}
    </div>
  );
}

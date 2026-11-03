"use client";
import { useState } from "react";
import { InspectorHeading } from "./InspectorHierarchy";
import { TransitionTypeChoice } from "./TransitionTypeChoice";
import type { TimelineTransitionType } from "./types";
export type CreateTransitionMenuProps = {
  layout?: "horizontal" | "vertical";
  fromLabel: string; toLabel: string;
  onCreateTransition: (type: TimelineTransitionType) => void | Promise<unknown>;
};
export function CreateTransitionMenu({fromLabel, toLabel, onCreateTransition}: CreateTransitionMenuProps) {
  const [busy, setBusy] = useState(false);
  return <div className="grid min-w-0 gap-3 p-3.5">
    <InspectorHeading>Add transition</InspectorHeading>
    <p className="m-0 break-words text-sm text-[var(--ink)]">{fromLabel} → {toLabel}</p>
    <TransitionTypeChoice disabled={busy} onChange={async type => {if (busy) return; setBusy(true); try {await onCreateTransition(type);} finally {setBusy(false);}}} />
  </div>;
}

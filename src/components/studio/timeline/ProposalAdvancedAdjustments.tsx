"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { InspectorDisclosure, InspectorItemHeader } from "./InspectorHierarchy";

type Slot = {
  count: number; order: number;
  /** The owner's name, shown once above its fields. */
  heading?: string;
  /** The last item heading the owner draws itself, so the next owner never repeats it. */
  endsWith?: string;
};
type Shared = {
  register: (id: string, slot: Slot | null) => void;
  targets: Record<string, HTMLElement | null>;
};

const SharedAdvanced = createContext<Shared | null>(null);

const advancedTitle = (count: number) => `Advanced adjustments (${count})`;

/**
 * One "Advanced adjustments" disclosure for a whole proposal option. Timing dials and
 * each motion graphic keep their own state; their advanced fields render here, in a
 * stable order, through `ProposalAdvancedGroup`. Place it after the option's main dials.
 */
export function ProposalAdvancedAdjustments({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [targets, setTargets] = useState<Record<string, HTMLElement | null>>({});
  const [open, setOpen] = useState(false);
  const refs = useRef(new Map<string, (node: HTMLElement | null) => void>());
  const register = useCallback((id: string, slot: Slot | null) => setSlots((current) => {
    const existing = current[id];
    if (!slot) {
      if (!existing) return current;
      const next = { ...current };
      delete next[id];
      return next;
    }
    if (existing && existing.count === slot.count && existing.order === slot.order
      && existing.heading === slot.heading && existing.endsWith === slot.endsWith) return current;
    return { ...current, [id]: slot };
  }), []);
  const refFor = (id: string) => {
    let ref = refs.current.get(id);
    if (!ref) {
      ref = (node) => setTargets((current) => current[id] === node ? current : { ...current, [id]: node });
      refs.current.set(id, ref);
    }
    return ref;
  };
  const value = useMemo(() => ({ register, targets }), [register, targets]);
  const ordered = Object.entries(slots).sort(([, a], [, b]) => a.order - b.order);
  const total = ordered.reduce((sum, [, slot]) => sum + slot.count, 0);
  return (
    <SharedAdvanced.Provider value={value}>
      {children}
      <div className="mt-3" hidden={total === 0}>
        {/* Kept mounted so each group's portal target exists while closed. */}
        <InspectorDisclosure title={advancedTitle(total)} open={open} onOpenChange={setOpen} keepMounted>
          <div className="grid min-w-0 gap-3">
            {ordered.map(([id, slot], index) => {
              const previous = ordered[index - 1]?.[1];
              const repeated = slot.heading === (previous?.endsWith ?? previous?.heading);
              return <div key={id} className="grid min-w-0 gap-1.5">
                {slot.heading && !repeated ? <InspectorItemHeader title={slot.heading} /> : null}
                <div ref={refFor(id)} className="contents" />
              </div>;
            })}
          </div>
        </InspectorDisclosure>
      </div>
    </SharedAdvanced.Provider>
  );
}

/**
 * The advanced fields of one adjustment owner. Inside a proposal option they join the
 * option's single Advanced disclosure; elsewhere (Properties) they keep their own.
 */
export function ProposalAdvancedGroup({ id, order, count, heading, endsWith, children }: {
  id: string; order: number; count: number;
  /** Names the owner inside the shared disclosure, where its main dials are out of view. */
  heading?: string;
  /** The last item heading `children` draws, so a following owner of that name is not repeated. */
  endsWith?: string;
  children: ReactNode;
}) {
  const shared = useContext(SharedAdvanced);
  const [open, setOpen] = useState(false);
  const register = shared?.register;
  useEffect(() => {
    if (!register) return;
    register(id, count > 0 ? { count, order, heading, endsWith } : null);
    return () => register(id, null);
  }, [register, id, order, count, heading, endsWith]);
  if (count === 0) return null;
  if (!shared) {
    return (
      <InspectorDisclosure title={advancedTitle(count)} open={open} onOpenChange={setOpen}>
        <div className="grid min-w-0 gap-1.5">{children}</div>
      </InspectorDisclosure>
    );
  }
  const target = shared.targets[id];
  return target ? createPortal(children, target) : null;
}

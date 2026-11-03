import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InspectorItemHeader } from "./InspectorHierarchy";
import { disconnectSpeechPatch, resolveSpeechSyncStatus } from "./speech-sync-status";
import type { TimelineElement } from "./types";

export function SpeechLinkControl({ element, elements, onPatch }: {
  element: TimelineElement | null;
  elements: TimelineElement[];
  onPatch: (id: string, patch: Record<string, unknown>) => void | Promise<unknown>;
}) {
  const status = resolveSpeechSyncStatus(element, elements);
  if (!element || !status) return null;
  const source = elements.find(candidate => candidate.id === status.audioElementId);
  const name = String(source?.props?.title || "Original speech");
  return <div className="grid min-w-0 gap-2" data-speech-sync-status={status.state}>
    <InspectorItemHeader title="Speech linked" actions={<Link2 className="size-4 text-[var(--ink-secondary)]" aria-hidden="true" />} />
    <span className="truncate text-xs text-[var(--ink-secondary)]" title={name}>{name}</span>
    {status.state !== "synced" && <p role="status" className="m-0 text-xs text-[var(--ink)]">
      {status.state === "missing" ? "Linked speech missing" : `Out of sync by ${Math.abs(status.offsetSeconds ?? 0).toFixed(2)}s`}
    </p>}
    <Button type="button" size="sm" variant="outline" className="w-fit" disabled={element.position_locked}
      onClick={() => void onPatch(element.id, disconnectSpeechPatch(element))}>Disconnect speech</Button>
  </div>;
}

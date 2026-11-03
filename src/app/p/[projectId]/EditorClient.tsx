"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { TimelineStep } from "@/components/studio/TimelineStep";
import type { SnapshotHistoryEntry } from "@/components/studio/timeline/useTimelineHistory";
import type { TimelineWorkspaceProfileId } from "@/components/studio/timeline/workspace-profile";
import {
  buildExternalSnapshotHistoryEntry,
  type ProjectHistoryDescriptor,
} from "@/components/studio/timeline/external-history";
import { projectRevisionPoll } from "@/components/studio/timeline/shared-poll";

/** Keeps the mounted editor synchronized when timeline.json changes outside
 *  this server (for example, a coding agent editing the file directly). */
export function EditorClient({
  projectId,
  workspaceProfile = "full",
  initialSeekSeconds,
}: {
  projectId: string;
  workspaceProfile?: TimelineWorkspaceProfileId;
  initialSeekSeconds?: number;
}) {
  const [externalRefreshToken, setExternalRefreshToken] = useState(0);
  const [externalHistoryEntries, setExternalHistoryEntries] = useState<SnapshotHistoryEntry[]>([]);
  const lastExternalRevRef = useRef<number | null>(null);
  const lastHistoryRef = useRef<ProjectHistoryDescriptor | null>(null);

  useEffect(() => {
    // Shared, visibility-aware conditional poll: unchanged revisions are 304s
    // and never reach this listener.
    lastExternalRevRef.current = null;
    return projectRevisionPoll(projectId).subscribe((body) => {
      const externalRev = body.external_rev ?? 0;
      const history = body.history?.id
        ? { id: body.history.id, op: body.history.op ?? "timeline_write", at: body.history.at ?? body.history.id }
        : null;
      if (lastExternalRevRef.current === null) {
        lastExternalRevRef.current = externalRev;
        lastHistoryRef.current = history;
        return;
      }
      if (externalRev !== lastExternalRevRef.current) {
        const beforeHistory = lastHistoryRef.current;
        lastExternalRevRef.current = externalRev;
        lastHistoryRef.current = history;
        const nextEntry = buildExternalSnapshotHistoryEntry(beforeHistory, history);
        if (nextEntry) {
          setExternalHistoryEntries((entries) => {
            if (entries.some((entry) => entry.beforeSnapshotId === nextEntry.beforeSnapshotId && entry.afterSnapshotId === nextEntry.afterSnapshotId)) return entries;
            return [...entries.slice(-49), nextEntry];
          });
        }
        setExternalRefreshToken((token) => token + 1);
        return;
      }
      lastHistoryRef.current = history;
    });
  }, [projectId]);

  // Approving an agent proposal writes through the API, which never trips the
  // external-rev poll above. Refresh data in place so the Player, playhead,
  // warmed media, and workspace state remain mounted.
  useEffect(() => {
    const onReload = () => setExternalRefreshToken((token) => token + 1);
    window.addEventListener("timeline-editor:reload", onReload);
    return () => window.removeEventListener("timeline-editor:reload", onReload);
  }, []);

  return (
      <TimelineStep
        projectId={projectId}
        workspaceProfileId={workspaceProfile}
        initialHistoryEntries={externalHistoryEntries}
        externalRefreshToken={externalRefreshToken}
        initialSeekSeconds={initialSeekSeconds}
      />
  );
}

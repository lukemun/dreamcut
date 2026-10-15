"use client";

import { useState } from "react";
import { CheckIcon, ExternalLinkIcon, PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type {
  HyperframesCompositionState,
  HyperframesCompositionSummary,
} from "@/lib/local-store/hyperframes-overlays";

type Action = "create" | "check" | "open_studio" | "render_approved";
type Resolution = "portrait" | "landscape" | "square";

type Props = {
  projectId: string;
  compositions: HyperframesCompositionSummary[];
  onRefresh: () => Promise<void>;
};

const STATUS_LABELS: Record<HyperframesCompositionState, string> = {
  draft: "Not rendered",
  current: "Up to date",
  source_changed: "Changes not rendered",
  render_missing: "Video missing",
  source_missing: "Editable animation missing",
};

function displayName(compositionId: string): string {
  return compositionId
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function HyperframesCompositionPanel({ projectId, compositions, onRefresh }: Props) {
  const [newCompositionId, setNewCompositionId] = useState("");
  const [resolution, setResolution] = useState<Resolution>("portrait");
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function runAction(action: Action, compositionId: string) {
    const key = `${compositionId}:${action}`;
    setRunningKey(key);
    setNotice(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/hyperframes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          composition_id: compositionId,
          ...(action === "create" ? { resolution } : {}),
          ...(action === "render_approved" ? { approved: true } : {}),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "We couldn't finish that animation. Try again.");
      if (action === "create") setNewCompositionId("");
      await onRefresh();
      setNotice({
        tone: "success",
        text: action === "open_studio"
          ? "HyperFrames Studio opened in your browser."
          : action === "check"
            ? "Animation check passed."
            : action === "render_approved"
              ? "Your animation is ready in Videos."
              : "Animation created. Open Studio to start designing.",
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "We couldn't finish that animation. Try again." });
    } finally {
      setRunningKey(null);
    }
  }

  const creating = runningKey === `${newCompositionId.trim()}:create`;

  return (
    <section className="mb-3" data-hyperframes-panel="" aria-label="Motion graphics">
      <h3 className="mb-2 text-[15px] font-semibold text-[var(--ink)]">New animation</h3>

      <form
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const compositionId = newCompositionId.trim();
          if (compositionId) void runAction("create", compositionId);
        }}
      >
        <Input
          aria-label="New animation name"
          placeholder="Animation name"
          value={newCompositionId}
          onChange={(event) => setNewCompositionId(event.target.value)}
          className="col-span-2 h-9 min-w-0 bg-[var(--chrome-deep)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
        />
        <NativeSelect aria-label="Animation shape" value={resolution} onChange={(event) => setResolution(event.target.value as Resolution)}>
          <option value="portrait">Portrait · 9:16</option>
          <option value="landscape">Landscape · 16:9</option>
          <option value="square">Square · 1:1</option>
        </NativeSelect>
        <Button type="submit" variant="outline" size="lg" disabled={!newCompositionId.trim() || runningKey != null}>
          <PlusIcon aria-hidden="true" />
          {creating ? "Creating…" : "Create"}
        </Button>
      </form>

      {notice ? (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className="mt-3 flex items-start justify-between gap-3 rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-deep)] px-3 py-2 text-sm leading-5 text-[var(--ink)]"
        >
          <span>{notice.text}</span>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Dismiss message" onClick={() => setNotice(null)}>
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {compositions.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {compositions.map((composition) => {
            const sourceAvailable = composition.state !== "source_missing";
            return (
              <article key={composition.composition_id} className="grid gap-2 rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-deep)] p-3">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--ink)]">{displayName(composition.composition_id)}</div>
                    <div className="mt-0.5 text-sm text-[var(--ink-muted)]">{STATUS_LABELS[composition.state]}</div>
                  </div>
                  {composition.state === "current" ? <CheckIcon aria-label="Animation is up to date" className="size-4 shrink-0 text-[var(--ink)]" /> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    disabled={!sourceAvailable || runningKey != null}
                    onClick={() => void runAction("open_studio", composition.composition_id)}
                  >
                    <ExternalLinkIcon aria-hidden="true" />
                    {runningKey === `${composition.composition_id}:open_studio` ? "Opening…" : "Open Studio"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    disabled={!sourceAvailable || runningKey != null}
                    onClick={() => void runAction("check", composition.composition_id)}
                  >
                    {runningKey === `${composition.composition_id}:check` ? "Checking…" : "Check"}
                  </Button>
                  <Button
                    type="button"
                    size="default"
                    disabled={!sourceAvailable || runningKey != null}
                    onClick={() => void runAction("render_approved", composition.composition_id)}
                  >
                    {runningKey === `${composition.composition_id}:render_approved` ? "Rendering…" : "Approve and render"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

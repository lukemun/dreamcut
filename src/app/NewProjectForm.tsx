"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TIMELINE_ASPECT_RATIOS, type TimelineAspectRatioValue } from "@/lib/aspect-ratios";

const FORMATS = TIMELINE_ASPECT_RATIOS.map(({ value, shape }) => ({ ratio: value, label: shape }));

/** `open="storyboard"` lands in the new project's Storyboard instead of the Editor. */
export function NewProjectForm({ trigger, open: destination = "editor" }: { trigger?: React.ReactElement; open?: "editor" | "storyboard" } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [aspectRatio, setAspectRatio] = useState<TimelineAspectRatioValue>("9:16");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: id.trim(), aspect_ratio: aspectRatio }),
      });
      const body = (await response.json()) as { error?: string; id?: string };
      if (!response.ok || !body.id) {
        throw new Error(body.error ?? "Failed to create project");
      }
      const projectId = body.id;
      router.push(destination === "storyboard" ? `/p/${projectId}/storyboard` : `/p/${projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={value => { if (!busy) { setOpen(value); setError(null); } }}>
      <Dialog.Trigger render={trigger ?? <Button size="lg" className="projects-create-trigger" />}>{trigger ? undefined : "Create project"}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-(--layer-dialog-backdrop) bg-black/60 backdrop-blur-sm" />
        <Dialog.Viewport className="editor-chrome fixed inset-0 z-(--layer-dialog) grid place-items-center overflow-y-auto p-4">
          <Dialog.Popup className="projects-dialog">
            <Dialog.Title className="text-xl font-semibold">Create project</Dialog.Title>
            <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
              <div className="flex flex-col gap-2 text-sm font-medium">
                <label htmlFor="new-project-name">Project name</label>
                <Input id="new-project-name" value={id} onChange={event => setId(event.target.value)} placeholder="My first video" maxLength={200} disabled={busy} required />
              </div>
              <fieldset className="projects-format-fieldset" disabled={busy}>
                <legend>Video shape</legend>
                <div className="projects-formats mt-3">
                  {FORMATS.map(({ ratio, label }) => (
                    <label key={ratio} className="projects-format-option">
                      <input type="radio" name="aspect-ratio" value={ratio} checked={aspectRatio === ratio} onChange={() => setAspectRatio(ratio)} />
                      <span className="projects-format-icon" style={{ aspectRatio: ratio.replace(":", "/") }} aria-hidden="true" />
                      <span>{label}<small>{ratio}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {error ? <p role="alert" className="text-sm text-[var(--destructive)]">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Dialog.Close render={<Button variant="outline" disabled={busy} />}>Cancel</Dialog.Close>
                <Button type="submit" disabled={busy || !id.trim()}>{busy ? "Creating…" : "Create project"}</Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

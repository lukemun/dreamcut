"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TIMELINE_ASPECT_RATIOS, type TimelineAspectRatioValue } from "@/lib/aspect-ratios";

const FORMATS = TIMELINE_ASPECT_RATIOS.map(({ value, shape }) => ({ ratio: value, label: shape }));

export function NewProjectForm({ trigger, draft, files = [] }: { trigger?: React.ReactElement; draft?: string; files?: File[] } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [aspectRatio, setAspectRatio] = useState<TimelineAspectRatioValue>("9:16");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<string>();
  const uploaded = useRef(new Set<File>());
  const [progress, setProgress] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      let projectId = createdId;
      if (!projectId) {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: id.trim(), aspect_ratio: aspectRatio }),
        });
        const body = (await response.json()) as { error?: string; id?: string };
        if (!response.ok || !body.id) {
          throw new Error(body.error ?? "Failed to create project");
        }
        projectId = body.id;
        setCreatedId(projectId);
      }
      if (draft?.trim()) sessionStorage.setItem(`dreamcut:chat-draft:${projectId}`, draft.trim());
      for (const [index, file] of files.entries()) {
        if (uploaded.current.has(file)) continue;
        setProgress(`Importing ${index + 1} of ${files.length}: ${file.name}`);
        const form = new FormData();
        form.append("file", file);
        form.append("asset_type", file.type.startsWith("image/") ? "still" : file.type.startsWith("audio/") ? "music" : "video_clip");
        const response = await fetch(`/api/projects/${projectId}/uploaded-assets`, { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(`${file.name}: ${result.error ?? "Import failed"}`);
        uploaded.current.add(file);
      }
      router.push(`/p/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={value => { if (!busy) { setOpen(value); setError(null); } }}>
      <Dialog.Trigger render={trigger ?? <Button size="lg" className="projects-create-trigger" />}>{trigger ? undefined : "Create project"}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[1190] bg-black/60 backdrop-blur-sm" />
        <Dialog.Viewport className="editor-chrome fixed inset-0 z-[1200] grid place-items-center overflow-y-auto p-4">
          <Dialog.Popup className="projects-dialog">
            <Dialog.Title className="text-xl font-semibold">Create project</Dialog.Title>
            <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
              <div className="flex flex-col gap-2 text-sm font-medium">
                <label htmlFor="new-project-name">Project name</label>
                <Input id="new-project-name" value={id} onChange={event => setId(event.target.value)} placeholder="my-first-video" disabled={busy || Boolean(createdId)} required />
              </div>
              <fieldset className="projects-format-fieldset" disabled={busy || Boolean(createdId)}>
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
              {files.length > 0 && <p className="text-xs text-[var(--ink-secondary)]">{files.length} media {files.length === 1 ? "file" : "files"} attached</p>}
              {busy && progress && <p role="status" className="text-xs">{progress}</p>}
              {error ? <p role="alert" className="text-sm text-[var(--destructive)]">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Dialog.Close render={<Button variant="outline" disabled={busy} />}>Cancel</Dialog.Close>
                {createdId && !busy && <Button variant="outline" onClick={() => router.push(`/p/${createdId}`)}>Open project</Button>}
                <Button type="submit" disabled={busy || !id.trim()}>{busy ? "Preparing…" : createdId ? "Retry imports" : "Create project"}</Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

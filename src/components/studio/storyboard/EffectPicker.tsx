"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { LibraryEffectCatalog } from "../timeline/LibraryEffectCatalog";
import type { GuideEffect } from "@/lib/effects/guide";
import styles from "./storyboard.module.css";

/** The Templates gallery as a picker: a template's details offer `actionLabel`, which hands it to the host. */
export function EffectPicker({ projectId, open, onOpenChange, onPick, title = "Add an effect", actionLabel = "Add" }: {
  projectId: string; open: boolean; onOpenChange: (open: boolean) => void; onPick: (effect: GuideEffect) => void; title?: string; actionLabel?: string;
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal><Dialog.Backdrop className={`fixed inset-0 z-(--layer-dialog-backdrop) ${styles.canvasBackdrop}`} /><Dialog.Viewport className="editor-chrome fixed inset-0 z-(--layer-dialog) grid place-items-center overflow-auto p-4">
      <Dialog.Popup className={styles.canvasPicker}>
        <div className={styles.sectionBar}><Dialog.Title>{title}</Dialog.Title><Dialog.Close render={<Button variant="ghost" />}>Close</Dialog.Close></div>
        <LibraryEffectCatalog projectId={projectId} active={open} detailAction={effect => <Button onClick={() => onPick(effect)}>{actionLabel}</Button>} />
      </Dialog.Popup>
    </Dialog.Viewport></Dialog.Portal>
  </Dialog.Root>;
}

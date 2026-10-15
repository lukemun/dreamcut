"use client";

import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AddKeyframeOption = {
  id: string;
  label: string;
  exists: boolean;
  add: () => void;
};

/** Add-only affordance: the existing row diamonds remain reversible toggles. */
export function AddKeyframeControl({ options }: { options: AddKeyframeOption[] }) {
  const selected = options[0];
  if (!selected) return null;
  return (
    <div data-testid="add-keyframe-control" className="flex shrink-0 items-center">
      <Button type="button" variant="ghost" size="icon-sm" disabled={selected.exists}
        aria-label="Add keyframe at playhead"
        title={selected.exists ? `${selected.label} already has a keyframe here` : `Add ${selected.label.toLowerCase()} keyframe at the playhead`}
        onClick={() => { if (!selected.exists) selected.add(); }}>
        <PlusIcon aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}

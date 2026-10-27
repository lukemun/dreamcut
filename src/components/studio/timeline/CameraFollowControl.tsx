"use client";

import { InspectorSection } from "./InspectorSection";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { OptionSelect } from "@/components/ui/select";
import { isCamera } from "@/lib/timeline/camera";
import type { TimelineElement } from "./types";

/** Which camera a shape, clip or text follows (timeline/camera.ts); shown once the project has a camera. */
export function CameraFollowControl({ element, elements, onPatch }: {
  element: TimelineElement; elements: readonly TimelineElement[]; onPatch: (patch: Record<string, unknown>) => void;
}) {
  if (isCamera(element)) return null;
  const cameras = elements.filter((candidate) => !candidate.removed_at && isCamera(candidate));
  if (!cameras.length) return null;
  const id = element.props?.camera_id;
  const value = typeof id === "string" && cameras.some((camera) => camera.id === id) ? id : "";
  return (
    <InspectorSection sectionId="camera" title="Camera">
      <InspectorPropertyControl density="compact" label="Follows" fields="camera_id" keyed={false} disabled={false} onReset={() => onPatch({ camera_id: null })}>
        <OptionSelect label="Follows" value={value}
          options={[{ value: "", label: "None" }, ...cameras.map((camera) => ({ value: camera.id, label: typeof camera.props?.title === "string" ? camera.props.title : "Camera" }))]}
          onValueChange={(next) => onPatch({ camera_id: next || null })} />
      </InspectorPropertyControl>
    </InspectorSection>
  );
}

import { isSafeHyperframesCompositionId } from "@/lib/local-store/paths";

export type HyperframesEditorAction = "create" | "check" | "open_studio" | "render_approved";
export type HyperframesResolution = "portrait" | "landscape" | "square";

export type HyperframesActionRequest = {
  action: HyperframesEditorAction;
  composition_id: string;
  resolution?: HyperframesResolution;
  approved?: true;
};

export function parseHyperframesActionRequest(value: unknown): HyperframesActionRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid animation action");
  const body = value as Record<string, unknown>;
  const action = body.action;
  const compositionId = body.composition_id;
  if (action !== "create" && action !== "check" && action !== "open_studio" && action !== "render_approved") {
    throw new Error("Unknown animation action");
  }
  if (typeof compositionId !== "string" || !isSafeHyperframesCompositionId(compositionId)) {
    throw new Error("Use letters, numbers, dots, dashes, or underscores for the animation name");
  }
  if (action === "create") {
    const resolution = body.resolution ?? "portrait";
    if (resolution !== "portrait" && resolution !== "landscape" && resolution !== "square") {
      throw new Error("Invalid animation format");
    }
    return { action, composition_id: compositionId, resolution };
  }
  if (action === "render_approved") {
    if (body.approved !== true) throw new Error("Rendering requires explicit preview approval");
    return { action, composition_id: compositionId, approved: true };
  }
  return { action, composition_id: compositionId };
}

export function hyperframesOverlayCliArgs(request: HyperframesActionRequest, projectId: string): string[] {
  switch (request.action) {
    case "create":
      return [
        "hyperframes-overlay",
        "scaffold",
        projectId,
        request.composition_id,
        "--resolution",
        request.resolution ?? "portrait",
      ];
    case "check":
      return ["hyperframes-overlay", "check", projectId, request.composition_id];
    case "open_studio":
      return ["hyperframes-overlay", "preview", projectId, request.composition_id];
    case "render_approved":
      return ["hyperframes-overlay", "render", projectId, request.composition_id, "--approved"];
  }
}

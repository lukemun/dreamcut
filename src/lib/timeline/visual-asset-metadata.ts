type PropsLike = Record<string, unknown> | null | undefined;

export type VisualAssetMetadata = {
  renderAssetType: "still_video" | null;
  sourceStillVideoUrl: string | null;
  sourceStillVideoDurationSeconds: number | null;
  overflowHoldStillVideoUrl: string | null;
  overflowHoldStillVideoDurationSeconds: number | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function readVisualAssetMetadata(props: PropsLike): VisualAssetMetadata {
  return {
    renderAssetType: props?.render_asset_type === "still_video" ? "still_video" : null,
    sourceStillVideoUrl: readString(props?.source_still_video_url),
    sourceStillVideoDurationSeconds: readFiniteNumber(props?.source_still_video_duration_seconds),
    overflowHoldStillVideoUrl: readString(props?.overflow_hold_still_video_url),
    overflowHoldStillVideoDurationSeconds: readFiniteNumber(props?.overflow_hold_still_video_duration_seconds),
  };
}

export function writeVisualAssetMetadata(
  props: PropsLike,
  metadata: Partial<VisualAssetMetadata>,
): Record<string, unknown> {
  const nextProps: Record<string, unknown> = { ...(props ?? {}) };

  if ("renderAssetType" in metadata) {
    if (metadata.renderAssetType === "still_video") {
      nextProps.render_asset_type = "still_video";
    } else {
      delete nextProps.render_asset_type;
    }
  }

  if ("sourceStillVideoUrl" in metadata) {
    if (typeof metadata.sourceStillVideoUrl === "string" && metadata.sourceStillVideoUrl.length > 0) {
      nextProps.source_still_video_url = metadata.sourceStillVideoUrl;
    } else {
      delete nextProps.source_still_video_url;
    }
  }

  if ("sourceStillVideoDurationSeconds" in metadata) {
    if (
      typeof metadata.sourceStillVideoDurationSeconds === "number"
      && Number.isFinite(metadata.sourceStillVideoDurationSeconds)
      && metadata.sourceStillVideoDurationSeconds > 0
    ) {
      nextProps.source_still_video_duration_seconds = metadata.sourceStillVideoDurationSeconds;
    } else {
      delete nextProps.source_still_video_duration_seconds;
    }
  }

  if ("overflowHoldStillVideoUrl" in metadata) {
    if (typeof metadata.overflowHoldStillVideoUrl === "string" && metadata.overflowHoldStillVideoUrl.length > 0) {
      nextProps.overflow_hold_still_video_url = metadata.overflowHoldStillVideoUrl;
    } else {
      delete nextProps.overflow_hold_still_video_url;
    }
  }

  if ("overflowHoldStillVideoDurationSeconds" in metadata) {
    if (
      typeof metadata.overflowHoldStillVideoDurationSeconds === "number"
      && Number.isFinite(metadata.overflowHoldStillVideoDurationSeconds)
      && metadata.overflowHoldStillVideoDurationSeconds > 0
    ) {
      nextProps.overflow_hold_still_video_duration_seconds = metadata.overflowHoldStillVideoDurationSeconds;
    } else {
      delete nextProps.overflow_hold_still_video_duration_seconds;
    }
  }

  return nextProps;
}

export function stripVisualAssetMetadata(props: PropsLike): Record<string, unknown> {
  const {
    render_asset_type: _renderAssetType,
    source_still_video_url: _sourceStillVideoUrl,
    source_still_video_duration_seconds: _sourceStillVideoDurationSeconds,
    overflow_hold_still_video_url: _overflowHoldStillVideoUrl,
    overflow_hold_still_video_duration_seconds: _overflowHoldStillVideoDurationSeconds,
    ...restProps
  } = props ?? {};

  return restProps;
}

export function stripStillVideoWrapperMetadata(props: PropsLike): Record<string, unknown> {
  const {
    render_asset_type: _renderAssetType,
    source_still_video_url: _sourceStillVideoUrl,
    source_still_video_duration_seconds: _sourceStillVideoDurationSeconds,
    ...restProps
  } = props ?? {};

  return restProps;
}

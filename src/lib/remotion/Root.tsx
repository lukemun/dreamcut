import { Fixture as Composition } from "@/lib/frame-runtime/fixtures";

import { TimelineComposition } from "./TimelineComposition";
import { COMPOSITION_FPS } from "@/lib/timeline/frame-quantization";

export function RemotionRoot() {
  return (
    <Composition
      id="TimelineComposition"
      component={TimelineComposition}
      durationInFrames={30 * COMPOSITION_FPS}
      fps={COMPOSITION_FPS}
      width={1920}
      height={1080}
      defaultProps={{ elements: [], laneOrderKeys: [], renderScale: 1 }}
    />
  );
}

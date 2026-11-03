import { Fixture as Composition, registerFixtureGroup as registerRoot } from "@/lib/frame-runtime/fixtures";

import { TimelineComposition } from "./TimelineComposition";
import {
  COLIN_EFFECT_PROOF_DURATION_FRAMES,
  COLIN_EFFECT_PROOF_FPS,
  COLIN_EFFECT_PROOF_HEIGHT,
  COLIN_EFFECT_PROOF_ID,
  COLIN_EFFECT_PROOF_WIDTH,
} from "./colin-effect-proof";
import type { CompositionElement } from "@/lib/render/composition-adapters";

type ColinEffectProofProps = {
  elements: CompositionElement[];
  laneOrderKeys: string[];
};

function ColinEffectProof(props: ColinEffectProofProps) {
  return <TimelineComposition {...props} />;
}

function FixtureRoot() {
  return (
    <Composition
      id={COLIN_EFFECT_PROOF_ID}
      component={ColinEffectProof}
      durationInFrames={COLIN_EFFECT_PROOF_DURATION_FRAMES}
      fps={COLIN_EFFECT_PROOF_FPS}
      width={COLIN_EFFECT_PROOF_WIDTH}
      height={COLIN_EFFECT_PROOF_HEIGHT}
      defaultProps={{ elements: [], laneOrderKeys: [] }}
    />
  );
}

registerRoot(FixtureRoot);

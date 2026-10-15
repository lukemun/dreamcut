import { Fixture as Composition, registerFixtureGroup as registerRoot } from "@/lib/frame-runtime/fixtures";
import { AbsoluteFill } from "@/lib/frame-runtime";

import { IDENTITY_COLOR_GRADE, type ColorGrade } from "../timeline/color-grade";
import { ColorGradeFilter } from "./ColorGradeFilter";

export const COLOR_GRADE_IDENTITY_FIXTURE_ID = "ColorGradeIdentityFixture";
export const COLOR_GRADE_WARM_FIXTURE_ID = "ColorGradeWarmFixture";
export const COLOR_GRADE_ADVANCED_FIXTURE_ID = "ColorGradeAdvancedFixture";

const WARM_GRADE: ColorGrade = {
  ...IDENTITY_COLOR_GRADE,
  temperature: 1,
  tint: 0.5,
};

const ADVANCED_GRADE: ColorGrade = {
  ...IDENTITY_COLOR_GRADE,
  exposureEv: 0.5,
  liftRgb: [0.04, 0, 0],
  gammaRgb: [1.1, 1, 0.9],
  gainRgb: [1.1, 1, 0.9],
  masterCurve: [0, 0.1, 0.22, 0.36, 0.52, 0.68, 0.81, 0.92, 1],
};

function Patch({ grade }: { grade: ColorGrade }) {
  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <ColorGradeFilter grade={grade}>
        <AbsoluteFill style={{ inset: 20, backgroundColor: "rgb(120, 120, 120)" }} />
      </ColorGradeFilter>
    </AbsoluteFill>
  );
}

function FixtureRoot() {
  return (
    <>
      <Composition id={COLOR_GRADE_IDENTITY_FIXTURE_ID} component={() => <Patch grade={IDENTITY_COLOR_GRADE} />} durationInFrames={1} fps={30} width={100} height={100} />
      <Composition id={COLOR_GRADE_WARM_FIXTURE_ID} component={() => <Patch grade={WARM_GRADE} />} durationInFrames={1} fps={30} width={100} height={100} />
      <Composition id={COLOR_GRADE_ADVANCED_FIXTURE_ID} component={() => <Patch grade={ADVANCED_GRADE} />} durationInFrames={1} fps={30} width={100} height={100} />
    </>
  );
}

registerRoot(FixtureRoot);

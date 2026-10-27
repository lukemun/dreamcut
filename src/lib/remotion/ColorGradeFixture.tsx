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
  lift: { rgb: [0.04, 0, 0], master: 0 },
  gamma: { rgb: [0.1, 0, -0.1], master: 0 },
  gain: { rgb: [0.15, 0, -0.15], master: 0 },
  curves: { ...IDENTITY_COLOR_GRADE.curves, y: [[0, 0], [0.48, 0.52], [1, 1]] },
};

// Grades sample pixels from an image or video, as clips do.
const PATCH_IMAGE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="rgb(120,120,120)"/></svg>')}`;

function Patch({ grade }: { grade: ColorGrade }) {
  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <ColorGradeFilter grade={grade}>
        <AbsoluteFill style={{ inset: 20 }}><img alt="" src={PATCH_IMAGE} style={{ width: "100%", height: "100%", display: "block" }} /></AbsoluteFill>
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

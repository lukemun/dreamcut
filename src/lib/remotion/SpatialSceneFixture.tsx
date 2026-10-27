import { Fixture as Composition, registerFixtureGroup as registerRoot } from "@/lib/frame-runtime/fixtures";
import { AbsoluteFill } from "@/lib/frame-runtime";
import { MediaTransformFrame } from './TimelineComposition';

export const spatialFixtureProps = { media_scale: 2, media_offset_x: 0.5, mask_inset: [0, 0.3, 0, 0] };
function Fixture() {
  return <AbsoluteFill style={{ background: 'black' }}>
    <MediaTransformFrame element={{ props: spatialFixtureProps }}>
      <div style={{ position: 'absolute', left: 40, top: 40, width: 10, height: 10, background: '#ff0000' }} />
    </MediaTransformFrame>
  </AbsoluteFill>;
}
function IrisFixture() {
  return <MediaTransformFrame element={{ props: { keyframes: { iris_radius: [{t: 0, v: 0}, {t: 1, v: 1}, {t: 2, v: 2}] } } }}><AbsoluteFill style={{ background: '#ff0000' }} /></MediaTransformFrame>;
}
function EdgeBlurFixture() {
  return <MediaTransformFrame element={{ props: { zoom_blur: 40 } }}><AbsoluteFill style={{ background: 'repeating-linear-gradient(90deg, black 0px, black 5px, white 5px, white 10px)' }} /></MediaTransformFrame>;
}
registerRoot(() => <><Composition id="SpatialSceneFixture" component={Fixture} durationInFrames={1} fps={30} width={100} height={100} /><Composition id="IrisFixture" component={IrisFixture} durationInFrames={61} fps={30} width={100} height={160} /><Composition id="EdgeBlurFixture" component={EdgeBlurFixture} durationInFrames={1} fps={30} width={100} height={160} /></>);

import { SpiralGroupFrame } from "./SpiralGroupFrame";
import { HandwritingText } from "./HandwritingText";
import { Fixture as Composition, registerFixtureGroup as registerRoot } from "@/lib/frame-runtime/fixtures";
import { useCurrentFrame, AbsoluteFill } from "@/lib/frame-runtime";

import { maskInsetStyle } from "../timeline/media-transform";
import { deriveGravityDrop } from "../timeline/gravity-drop";
import { TimelineComposition } from "./TimelineComposition";
import type { CompositionElement } from "../render/composition-adapters";

const FIXTURE_ID = "EffectPrimitiveFixture";

function FeatherFixture() {
  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <AbsoluteFill
        style={{
          backgroundColor: "black",
          ...maskInsetStyle({ top: 0.2, right: 0.1, bottom: 0.2, left: 0.1 }, 0.1),
        }}
      />
    </AbsoluteFill>
  );
}

function HandwritingFixture() {
  const frame = useCurrentFrame();
  return <HandwritingText text="B" progress={frame / 59} fontSize={180} maxWidth={200} singleLine align="left" color="#ffffff" />;
}

function HandwritingWeightFixture({ weight = 0 }: { weight?: number }) {
  const frame = useCurrentFrame();
  return <div style={{ padding: 20 }}><HandwritingText fontPreset="indie_flower" text="Neo" progress={frame / 30} weight={weight} fontSize={80} maxWidth={260} singleLine align="center" color="#ffffff" /></div>;
}

function MarkerFixture() {
  const frame = useCurrentFrame();
  return <HandwritingText fontPreset="permanent_marker" text="B" progress={frame / 59} fontSize={180} maxWidth={200} singleLine align="left" color="#ffffff" />;
}

function SpiralFixture() {
  return <SpiralGroupFrame props={{spiral_group:{origin_x:.5,origin_y:.3,start_seconds:0,duration_seconds:2,turns:3}}}><div style={{position:"absolute",left:80,top:100,width:40,height:30,background:"red"}}/><div style={{position:"absolute",left:125,top:100,width:20,height:30,background:"white"}}/></SpiralGroupFrame>;
}

function GravityFixture() {
  const base: CompositionElement = { id: "gravity-text", type: "caption_text", source_url: null,
    props: deriveGravityDrop({text: "DROP", fontPreset: "clean_sans", fontSizePx: 32, textColor: "#ffffff", absX: .2, absY: .3, maxWidth: .6, positionPreset: "center", animationIn: "none", animationOut: "none"}, 0, .8),
    timeline_start: 0, duration: 2, lane_key: "captions_0", lane_index: 0, volume: 0, playback_rate: 1, trim_start: 0, trim_end: 0, fade_in: 0, fade_out: 0 };
  const object: CompositionElement = {...base, id: "gravity-object", type: "still", lane_key: "visual_0",
    source_url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="400"><rect x="140" y="110" width="40" height="30" fill="#ff0000"/></svg>')}`,
    props: deriveGravityDrop({has_alpha: true}, 0, .8)};
  return <TimelineComposition elements={[base, object]} laneOrderKeys={["captions_0", "visual_0"]} />;
}

function LetterFallFixture() {
  const text: CompositionElement = { id: "letter-fall", type: "caption_text", source_url: null,
    props: {text: "HHH", fontPreset: "clean_sans", fontSizePx: 40, textColor: "#ffffff", absX: .1, absY: .2,
      maxWidth: .9, positionPreset: "center", animationIn: "none", animationOut: "none",
      letter_fall_start_seconds: 0, letter_fall_seconds: .8, letter_fall_stagger_seconds: .2},
    timeline_start: 0, duration: 2, lane_key: "captions_0", lane_index: 0, volume: 0, playback_rate: 1,
    trim_start: 0, trim_end: 0, fade_in: 0, fade_out: 0 };
  return <TimelineComposition elements={[text]} laneOrderKeys={["captions_0"]} />;
}

function FixtureRoot() {
  return (
    <>
    <Composition id="GravityFixture" component={GravityFixture} durationInFrames={60} fps={30} width={240} height={400} />
    <Composition id="LetterFallFixture" component={LetterFallFixture} durationInFrames={60} fps={30} width={240} height={400} />
    <Composition id="SpiralFixture" component={SpiralFixture} durationInFrames={61} fps={30} width={240} height={400} />
    <Composition id="HandwritingWeightFixture" component={HandwritingWeightFixture} durationInFrames={32} fps={30} width={300} height={180} />
    <Composition id="MarkerFixture" component={MarkerFixture} durationInFrames={60} fps={30} width={200} height={200} />
    <Composition id="HandwritingFixture" component={HandwritingFixture} durationInFrames={60} fps={30} width={200} height={200} />
    <Composition id="RotatedLineFixture" component={() => <AbsoluteFill style={{ backgroundColor: "black", ...maskInsetStyle({ top: .5, right: 0, bottom: 0, left: 0 }, .2, 90, { width: 100, height: 100 }) }} />} durationInFrames={1} fps={30} width={100} height={100} />
    <Composition
      id={FIXTURE_ID}
      component={FeatherFixture}
      durationInFrames={1}
      fps={30}
      width={100}
      height={100}
    />
    </>
  );
}

registerRoot(FixtureRoot);

export { FIXTURE_ID };

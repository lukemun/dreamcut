import { Fixture as Composition, registerFixtureGroup as registerRoot } from "@/lib/frame-runtime/fixtures";
import { AbsoluteFill, Img, Video } from "@/lib/frame-runtime";
import { RecolorFilter } from "./RecolorFilter";

function Fixture({ src, video, amount, shading }: {src: string;video: boolean;amount: number;shading: number}) {
  return <AbsoluteFill style={{background: '#0000ff'}}>
    <RecolorFilter props={{recolor_color:'#ff0000',recolor_amount:amount,recolor_preserve_shading:shading}}>
      {video ? <Video src={src} muted style={{width:'100%',height:'100%'}} /> : <Img src={src} style={{width:'100%',height:'100%'}} />}
    </RecolorFilter>
  </AbsoluteFill>;
}
registerRoot(() => <Composition id="RecolorFixture" component={Fixture} width={100} height={100} fps={30} durationInFrames={30} defaultProps={{src:'',video:false,amount:1,shading:0}} />);

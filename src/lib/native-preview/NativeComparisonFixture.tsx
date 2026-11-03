/** Strict picture-only engineering fixture. No Standard fallback and no delivery API. */
import {useLayoutEffect,useRef,type ComponentProps} from 'react';
import {useFrameState} from '@/lib/frame-runtime';
import {Fixture,registerFixtureGroup} from '@/lib/frame-runtime/fixtures';
import {TimelineComposition} from '@/lib/remotion/TimelineComposition';
import {nativeScene} from './scene';
function NativeComparisonFixture({projectId,...live}:ComponentProps<typeof TimelineComposition>&{projectId:string}){
 const state=useFrameState(),canvas=useRef<HTMLCanvasElement>(null),session=useRef(crypto.randomUUID());
 useLayoutEffect(()=>{
  const key=`native-comparison-${session.current}`;
  state.session.draws.set(key,async()=>{
   const scene=nativeScene(live.elements,live.laneOrderKeys,state.frame,state.width,state.height,true);
   for(const layer of scene.layers)if(layer.path.startsWith('http'))layer.path=new URL(layer.path).pathname;
   const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/native-preview`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session:session.current,scene})});
   if(!response.ok)throw Error(await response.text());
   const bytes=new Uint8ClampedArray(await response.arrayBuffer());
   if(bytes.length!==state.width*state.height*4)throw Error('Incomplete native comparison frame');
   const context=canvas.current?.getContext('2d');if(!context)throw Error('Missing comparison canvas');
   context.putImageData(new ImageData(bytes,state.width,state.height),0,0);
  });
  return()=>{state.session.draws.delete(key);};
 },[live,state,projectId]);
 return <><canvas ref={canvas} width={state.width} height={state.height} style={{position:'absolute',inset:0}}/><TimelineComposition {...live} captionOverlayOnly/></>;
}
registerFixtureGroup(()=> <Fixture id="NativeComparisonFixture" component={NativeComparisonFixture} width={270} height={480} fps={30} durationInFrames={30}/>);

import {NativeSourceProvider} from "./NativeSourceProvider";
function NativeFullComparison({projectId,...live}:ComponentProps<typeof TimelineComposition>&{projectId:string}){return <NativeSourceProvider projectId={projectId}><TimelineComposition {...live}/></NativeSourceProvider>;}
registerFixtureGroup(()=> <Fixture id="NativeFullComparison" component={NativeFullComparison} width={270} height={480} fps={30} durationInFrames={30}/>);

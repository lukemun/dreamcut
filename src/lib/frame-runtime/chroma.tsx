"use client";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import { useFrameState } from ".";
import { Video as SourceVideo, type MediaProps } from "./media";
export type ColorKey = { keyColor: string; similarity: number; smoothness: number; spillSuppression: number };
export function colorKey(params: ColorKey) { return params; }
/** DreamCut's own chroma-distance shader; BT.601 chroma separates hue from luma. */
function createKeyer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", {alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
  if (!gl) throw new Error("Chroma key requires WebGL2");
  const shader = (kind: number, code: string) => {
    const result=gl.createShader(kind)!;gl.shaderSource(result,code);gl.compileShader(result);
    if (!gl.getShaderParameter(result,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result)??"Chroma shader failed");
    return result;
  };
  const vertex=shader(gl.VERTEX_SHADER,`#version 300 es
    in vec2 position; out vec2 uv;
    void main(){ uv=(position+1.0)*0.5; gl_Position=vec4(position,0.,1.); }`);
  const fragment=shader(gl.FRAGMENT_SHADER,`#version 300 es
    precision highp float; in vec2 uv; out vec4 outputColor;
    uniform sampler2D source; uniform vec3 key; uniform float tolerance; uniform float softness; uniform float spill;
    vec2 chroma(vec3 rgb){ return vec2(dot(rgb,vec3(-.168736,-.331264,.5)),dot(rgb,vec3(.5,-.418688,-.081312))); }
    void main(){
      vec4 pixel=texture(source,uv);
      float distance=length(chroma(pixel.rgb)-chroma(key));
      float mask=clamp((distance-tolerance)/max(softness,.00001),0.,1.);
      mask=mask*mask*(3.-2.*mask);
      vec3 direction=max(key-vec3(dot(key,vec3(.299,.587,.114))),vec3(0.));
      float dominance=dot(direction,direction);
      float excess=max(0.,dot(pixel.rgb-vec3(dot(pixel.rgb,vec3(.299,.587,.114))),direction)/max(dominance,.00001));
      vec3 clean=max(vec3(0.),pixel.rgb-direction*excess*spill*(1.-mask));
      outputColor=vec4(clean,pixel.a*mask);
    }`);
  const program=gl.createProgram()!;gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)??"Chroma program failed");
  const buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const texture=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return {
    draw(video:HTMLVideoElement|HTMLCanvasElement,effect:ColorKey){
      const width=video instanceof HTMLVideoElement?video.videoWidth:video.width,height=video instanceof HTMLVideoElement?video.videoHeight:video.height;
      if (canvas.width!==width || canvas.height!==height) {canvas.width=width;canvas.height=height;}
      gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      const location=gl.getAttribLocation(program,"position");gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);
      const rgb=[1,3,5].map(offset=>parseInt(effect.keyColor.slice(offset,offset+2),16)/255);
      gl.uniform3f(gl.getUniformLocation(program,"key"),rgb[0],rgb[1],rgb[2]);
      for (const [name,value] of [["tolerance",effect.similarity],["softness",effect.smoothness],["spill",effect.spillSuppression]] as const) gl.uniform1f(gl.getUniformLocation(program,name),value);
      gl.uniform1i(gl.getUniformLocation(program,"source"),0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.finish();
      if(gl.getError()!==gl.NO_ERROR) throw new Error("Chroma key draw failed");
    },
    dispose(){gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);}
  };
}
export function Video({effects,style,objectFit="contain",fallbackOffthreadVideoProps,_experimentalInitiallyDrawCachedFrame,...props}:MediaProps & {effects:ColorKey[];objectFit?:CSSProperties['objectFit'];fallbackOffthreadVideoProps?:Partial<MediaProps>;_experimentalInitiallyDrawCachedFrame?:boolean}) {
  const state=useFrameState(),id=useId(),root=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const currentEffects=useRef(effects); currentEffects.current=effects;
  useEffect(()=>{
    const keyer=createKeyer(canvas.current!);let handle=0;
    const draw=()=>{
      const source=root.current?.querySelector("canvas[data-native-source],video") as HTMLCanvasElement|HTMLVideoElement|null;
      if(!source || (source instanceof HTMLVideoElement && (source.readyState<2 || source.seeking))) {if(state.rendering) throw new Error("Chroma source frame not ready");return;}
      if(currentEffects.current.length!==1) throw new Error("Chroma video requires exactly one key effect");
      keyer.draw(source,currentEffects.current[0]);
    };
    state.session.draws.set(id,draw);
    const preview=()=>{try{draw();}catch(e){state.session.fail(e);return;}handle=requestAnimationFrame(preview);};
    if(!state.rendering && state.effectDrawMode!=="settled")handle=requestAnimationFrame(preview);
    return()=>{cancelAnimationFrame(handle);state.session.draws.delete(id);keyer.dispose();};
  },[state.session,state.rendering,state.effectDrawMode,id]);
  return <div ref={root} style={{...style,position:style?.position??"relative"}}>
    <SourceVideo {...fallbackOffthreadVideoProps} {...props} crossOrigin={props.crossOrigin??"anonymous"} style={{position:"absolute",width:"100%",height:"100%",opacity:0}} />
    <canvas data-dreamcut-effect-output="chroma" ref={canvas} style={{width:"100%",height:"100%",objectFit,display:"block"}} />
  </div>;
}

"use client";
import {recolorMatrix,type Recolor} from "../timeline/recolor";


import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, useRenderResource, useCurrentFrame, useVideoConfig } from "@/lib/frame-runtime";

import { cubeLutRgbaBytes, parseCubeLut, type ColorGradeLut, type ParsedCubeLut } from "../timeline/cube-lut";
import type { ColorGradeFilterDescriptor } from "../timeline/color-grade";

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = vec2((a_position.x + 1.0) * 0.5, 1.0 - (a_position.y + 1.0) * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_source;
uniform vec2 u_sourceScale;
uniform vec4 u_recolorR;
uniform vec4 u_recolorG;
uniform vec4 u_recolorB;
uniform bool u_recolorActive;
uniform highp sampler3D u_lut;
uniform vec3 u_exposureWhiteBalance;
uniform float u_contrastSlope;
uniform float u_contrastIntercept;
uniform float u_saturation;
uniform float u_hueDegrees;
uniform vec3 u_liftSlope;
uniform vec3 u_liftIntercept;
uniform vec3 u_gammaExponent;
uniform vec3 u_gainSlope;
uniform float u_curve[17];
uniform float u_tone[65];
uniform bool u_toneActive;
uniform vec3 u_domainMin;
uniform vec3 u_domainMax;
uniform float u_lutIntensity;

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linearToSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 hueRotate(vec3 color, float degrees) {
  float angle = radians(degrees);
  float c = cos(angle);
  float s = sin(angle);
  mat3 m = mat3(
    0.213 + c * 0.787 - s * 0.213, 0.213 - c * 0.213 + s * 0.143, 0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 - s * 0.715, 0.715 + c * 0.285 + s * 0.140, 0.715 - c * 0.715 + s * 0.715,
    0.072 - c * 0.072 + s * 0.928, 0.072 - c * 0.072 - s * 0.283, 0.072 + c * 0.928 + s * 0.072
  );
  return m * color;
}
float curveSample(float value) {
  float scaled = clamp(value, 0.0, 1.0) * 16.0;
  int left = int(floor(scaled));
  int right = min(16, left + 1);
  return mix(u_curve[left], u_curve[right], fract(scaled));
}
float toneSample(float value) {
  float scaled = clamp(value, 0.0, 1.0) * 64.0;
  int left = int(floor(scaled));
  return mix(u_tone[left], u_tone[min(64, left + 1)], fract(scaled));
}
void main() {
  vec2 sourceUv = (v_uv - 0.5) / u_sourceScale + 0.5;
  if (any(lessThan(sourceUv, vec2(0.0))) || any(greaterThan(sourceUv, vec2(1.0)))) {
    outColor = vec4(0.0);
    return;
  }
  vec4 source = texture(u_source, sourceUv);
  vec3 inputRgb=source.rgb;
  if(u_recolorActive){
    vec4 original=vec4(inputRgb,1.0);
    inputRgb=clamp(vec3(dot(u_recolorR,original),dot(u_recolorG,original),dot(u_recolorB,original)),0.0,1.0);
    inputRgb=floor(inputRgb*255.0+0.5)/255.0;
  }
  vec3 color = srgbToLinear(inputRgb);
  color *= u_exposureWhiteBalance;
  color = color * u_contrastSlope + vec3(u_contrastIntercept);
  if (u_toneActive) color = vec3(toneSample(color.r), toneSample(color.g), toneSample(color.b));
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, u_saturation);
  color = hueRotate(color, u_hueDegrees);
  color = color * u_liftSlope + u_liftIntercept;
  color = pow(max(color, vec3(0.0)), u_gammaExponent);
  color *= u_gainSlope;
  color = vec3(curveSample(color.r), curveSample(color.g), curveSample(color.b));
  vec3 gradedSrgb = clamp(linearToSrgb(color), 0.0, 1.0);
  vec3 lutCoord = clamp((gradedSrgb - u_domainMin) / (u_domainMax - u_domainMin), 0.0, 1.0);
  vec3 looked = texture(u_lut, lutCoord).rgb;
  // The canvas compositor expects premultiplied output; LUT lift must never
  // introduce color where the source is transparent.
  outColor = vec4(mix(gradedSrgb, looked, u_lutIntensity) * source.a, source.a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create LUT shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const message=gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message ?? "LUT shader compilation failed."); }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
  const program = gl.createProgram();
  if (!program) throw new Error("Could not create LUT program.");
  const shaders:WebGLShader[]=[];
  try {
    for(const [type,source] of [[gl.VERTEX_SHADER,VERTEX_SHADER],[gl.FRAGMENT_SHADER,FRAGMENT_SHADER]] as const){
      const shader=compile(gl,type,source);shaders.push(shader);gl.attachShader(program,shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "LUT shader link failed.");
  } catch(error){gl.deleteProgram(program);throw error;}
  finally {for(const shader of shaders)gl.deleteShader(shader);}

  return program;
}

function location(gl: WebGL2RenderingContext, program: WebGLProgram, name: string) {
  const value = gl.getUniformLocation(program, name);
  if (value == null) throw new Error(`Missing LUT shader uniform ${name}.`);
  return value;
}

export function lutSourceScale(width:number,height:number,sourceWidth:number,sourceHeight:number):[number,number] {
  if (![width,height,sourceWidth,sourceHeight].every(value=>Number.isFinite(value)&&value>0)) return [1,1];
  const fit=Math.min(width/sourceWidth,height/sourceHeight);
  return [sourceWidth*fit/width,sourceHeight*fit/height];
}

export function drawLutFrame(canvas: HTMLCanvasElement, source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, parsed: ParsedCubeLut, descriptor: ColorGradeFilterDescriptor, intensity: number, sourceRecolor?:Recolor) {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 is unavailable; LUT rendering is blocked.");
  const program = createProgram(gl);
  let position:WebGLBuffer|null=null,sourceTexture:WebGLTexture|null=null,lutTexture:WebGLTexture|null=null;
  try {
  gl.useProgram(program);
  position = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, position);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  sourceTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.uniform1i(location(gl, program, "u_source"), 0);
  const sourceWidth='videoWidth' in source?source.videoWidth:'naturalWidth' in source?source.naturalWidth:source.width;
  const sourceHeight='videoHeight' in source?source.videoHeight:'naturalHeight' in source?source.naturalHeight:source.height;
  gl.uniform2fv(location(gl,program,'u_sourceScale'),lutSourceScale(canvas.width,canvas.height,sourceWidth,sourceHeight));
  const recolor=recolorMatrix(sourceRecolor??{color:'#ffffff',amount:0,preserveShading:true});
  for(const [name,row] of [['u_recolorR',0],['u_recolorG',5],['u_recolorB',10]] as const)gl.uniform4f(location(gl,program,name),recolor[row],recolor[row+1],recolor[row+2],recolor[row+4]);
  gl.uniform1i(location(gl,program,'u_recolorActive'),sourceRecolor&&sourceRecolor.amount>0?1:0);

  const lutBytes = cubeLutRgbaBytes(parsed);
  lutTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_3D, lutTexture);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, parsed.size, parsed.size, parsed.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutBytes);
  gl.uniform1i(location(gl, program, "u_lut"), 1);

  gl.uniform3f(location(gl, program, "u_exposureWhiteBalance"), descriptor.exposureSlope * descriptor.redGain, descriptor.exposureSlope * descriptor.greenGain, descriptor.exposureSlope * descriptor.blueGain);
  gl.uniform1f(location(gl, program, "u_contrastSlope"), descriptor.contrastSlope);
  gl.uniform1f(location(gl, program, "u_contrastIntercept"), descriptor.contrastIntercept);
  gl.uniform1f(location(gl, program, "u_saturation"), descriptor.saturation);
  gl.uniform1f(location(gl, program, "u_hueDegrees"), descriptor.hueDegrees);
  gl.uniform3fv(location(gl, program, "u_liftSlope"), descriptor.liftSlope);
  gl.uniform3fv(location(gl, program, "u_liftIntercept"), descriptor.liftIntercept);
  gl.uniform3fv(location(gl, program, "u_gammaExponent"), descriptor.gammaExponent);
  gl.uniform3fv(location(gl, program, "u_gainSlope"), descriptor.gainSlope);
  gl.uniform1i(location(gl, program, "u_toneActive"), descriptor.toneActive ? 1 : 0);
  gl.uniform1fv(location(gl, program, "u_tone[0]"), descriptor.toneTable);
  gl.uniform1fv(location(gl, program, "u_curve[0]"), descriptor.masterCurveTable);
  gl.uniform3fv(location(gl, program, "u_domainMin"), parsed.domainMin);
  gl.uniform3fv(location(gl, program, "u_domainMax"), parsed.domainMax);
  gl.uniform1f(location(gl, program, "u_lutIntensity"), intensity);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  const error = gl.getError();
  if (error !== gl.NO_ERROR) throw new Error(`WebGL LUT rendering failed with code ${error}.`);
  } finally {
    // Deletion is deferred safely by WebGL until queued draws finish.
    gl.useProgram(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,null);
    if(position)gl.deleteBuffer(position);
    if(sourceTexture)gl.deleteTexture(sourceTexture);
    if(lutTexture)gl.deleteTexture(lutTexture);
    gl.deleteProgram(program);
  }
}

export function LutCanvasFilter({ lut, descriptor, sourceOrientationStyle, sourceRecolor, children }: { sourceRecolor?:Recolor; sourceOrientationStyle?:Pick<CSSProperties,"transform"|"transformOrigin">; lut: ColorGradeLut; descriptor: ColorGradeFilterDescriptor; children: ReactNode }) {
  const frame = useCurrentFrame();
  const { width, height, session, rendering, effectDrawMode } = useVideoConfig();
  const drawId = useId();
  const sourceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filterCanvases = useRef<HTMLCanvasElement[]>([]);
  const [parsed, setParsed] = useState<ParsedCubeLut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadHandle = useRenderResource(`LUT ${lut.assetId}:${lut.sourceUrl}`);

  useEffect(() => {
    let cancelled = false;
    fetch(lut.sourceUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`LUT request failed (${response.status}).`);
        return response.text();
      })
      .then((text) => {
        if (!cancelled) setParsed(parseCubeLut(text));
      })
      .catch((cause) => {
        const message = cause instanceof Error ? cause.message : "LUT loading failed.";
        if (!cancelled) { setError(message); loadHandle.fail(new Error(message)); }
      });
    return () => { cancelled = true; };
  }, [loadHandle, lut.sourceUrl]);

  useEffect(() => {
    if (!parsed) return;
    let handle = 0;
    const draw = () => {
      const source = (sourceRef.current?.querySelector("canvas[data-dreamcut-effect-output]") ?? sourceRef.current?.querySelector("img, video, canvas")) as HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
      const ready = source instanceof HTMLImageElement ? source.complete && source.naturalWidth > 0
        : source instanceof HTMLVideoElement ? source.readyState >= 2 && !source.seeking && source.videoWidth > 0
          : source instanceof HTMLCanvasElement ? source.width > 0 : false;
      if (!source || !ready || !canvasRef.current) {
        if (rendering) throw new Error("Source frame was not ready for LUT rendering.");
        return;
      }
      // drawImage samples pixels, not the element's ancestor SVG filters. Replay
      // the existing inner filter chain before grading instead of dropping it.
      const filters:string[]=[];
      for(let node:HTMLElement|null=source;node&&node!==sourceRef.current;node=node.parentElement){
        const filter=getComputedStyle(node).filter;
        if(filter&&filter!=="none")filters.push(filter);
      }
      let input:HTMLImageElement|HTMLVideoElement|HTMLCanvasElement=source;
      if(filters.length){
        const sw=source instanceof HTMLVideoElement?source.videoWidth:source instanceof HTMLImageElement?source.naturalWidth:source.width;
        const sh=source instanceof HTMLVideoElement?source.videoHeight:source instanceof HTMLImageElement?source.naturalHeight:source.height;
        const [sx,sy]=lutSourceScale(width,height,sw,sh);
        for(let index=0;index<filters.length;index++){
          const slot=index%2;
          const canvas=filterCanvases.current[slot]??(filterCanvases.current[slot]=document.createElement('canvas'));
          canvas.width=width;canvas.height=height;
          const context=canvas.getContext('2d');
          if(!context)throw Error('Canvas2D unavailable for pre-LUT effects.');
          context.filter=filters[index];
          if(index===0)context.drawImage(input,(1-sx)*width/2,(1-sy)*height/2,sx*width,sy*height);
          else context.drawImage(input,0,0);
          input=canvas;
        }
      }
      drawLutFrame(canvasRef.current, input, parsed, descriptor, lut.intensity, filters.length?undefined:sourceRecolor);
    };
    session.draws.set(drawId, draw);
    // Parsing schedules a React update; its promise finishing does not mean
    // this draw callback is installed. Keep settlement waiting until it is.
    loadHandle.done();
    const preview = () => {
      try { draw(); } catch (cause) { session.fail(cause); setError(String(cause)); return; }
      handle = requestAnimationFrame(preview);
    };
    if (!rendering && effectDrawMode!=="settled") handle = requestAnimationFrame(preview);
    return () => { cancelAnimationFrame(handle); session.draws.delete(drawId); };
  }, [descriptor, frame, lut.intensity, parsed, sourceRecolor, session, drawId, rendering, effectDrawMode, loadHandle]);

  return (
    <AbsoluteFill>
      <AbsoluteFill ref={sourceRef} style={{ opacity: 0, pointerEvents: "none" }}>{children}</AbsoluteFill>
      {/* Sampling the child canvas does not capture its ancestor CSS orientation. */}
      <canvas data-color-grade-lut-output ref={canvasRef} width={width} height={height} style={{ width: "100%", height: "100%", display: "block", ...sourceOrientationStyle }} />
      {error ? <div role="alert" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, background: "#171717", color: "#ffffff", fontSize: 20, textAlign: "center" }}>{error}</div> : null}
    </AbsoluteFill>
  );
}

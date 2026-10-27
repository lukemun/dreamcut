"use client";
import { recolorMatrix, type Recolor } from "../timeline/recolor";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, useRenderResource, useCurrentFrame, useVideoConfig } from "@/lib/frame-runtime";

import { cubeLutRgbaBytes, parseCubeLut, type ColorGradeLut, type ParsedCubeLut } from "../timeline/cube-lut";
import type { ColorGradeFilterDescriptor } from "../timeline/color-grade";
import { ATLAS_ROW_COUNT, ATLAS_WIDTH } from "../color/grade-v2";
import { WEBGL_GRADE_V2_FRAGMENT, matrixColumns } from "../color/grade-shader";

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = vec2((a_position.x + 1.0) * 0.5, 1.0 - (a_position.y + 1.0) * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

type GradeGl = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  position: WebGLBuffer;
  sourceTexture: WebGLTexture;
  atlasTexture: WebGLTexture;
  lutTexture: WebGLTexture;
  atlasKey: string | null;
  lutIdentity: object | null;
  uniforms: Map<string, WebGLUniformLocation | null>;
};

/** One program and set of textures per output canvas; a draw uploads only the source frame and what changed. */
const contexts = new WeakMap<HTMLCanvasElement, GradeGl>();

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create grade shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message ?? "Grade shader compilation failed."); }
  return shader;
}

function texture(gl: WebGL2RenderingContext, target: number, filter: number) {
  const value = gl.createTexture();
  if (!value) throw new Error("Could not create grade texture.");
  gl.bindTexture(target, value);
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (target === gl.TEXTURE_3D) gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  return value;
}

function createGradeGl(canvas: HTMLCanvasElement): GradeGl {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 is unavailable; colour grading is blocked.");
  const created: Array<() => void> = [];
  try {
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create grade program.");
    created.push(() => gl.deleteProgram(program));
    const shaders = [compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER), compile(gl, gl.FRAGMENT_SHADER, WEBGL_GRADE_V2_FRAGMENT)];
    for (const shader of shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Grade shader link failed.");
    const position = gl.createBuffer();
    if (!position) throw new Error("Could not create grade geometry.");
    created.push(() => gl.deleteBuffer(position));
    gl.bindBuffer(gl.ARRAY_BUFFER, position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const sourceTexture = texture(gl, gl.TEXTURE_2D, gl.LINEAR); created.push(() => gl.deleteTexture(sourceTexture));
    const atlasTexture = texture(gl, gl.TEXTURE_2D, gl.NEAREST); created.push(() => gl.deleteTexture(atlasTexture));
    const lutTexture = texture(gl, gl.TEXTURE_3D, gl.LINEAR); created.push(() => gl.deleteTexture(lutTexture));
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 2, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(32).fill(255));
    return { gl, program, position, sourceTexture, atlasTexture, lutTexture, atlasKey: null, lutIdentity: null, uniforms: new Map() };
  } catch (error) {
    for (const release of created.reverse()) release();
    throw error;
  }
}

/** Free a canvas's grade program and textures (on unmount, or after a failed draw). */
export function releaseGradeCanvas(canvas: HTMLCanvasElement) {
  const state = contexts.get(canvas);
  if (!state) return;
  contexts.delete(canvas);
  const { gl } = state;
  gl.deleteTexture(state.sourceTexture); gl.deleteTexture(state.atlasTexture); gl.deleteTexture(state.lutTexture);
  gl.deleteBuffer(state.position); gl.deleteProgram(state.program);
}

/** A uniform's location, or null when the GLSL compiler removed it as unused (setting null is a no-op). */
function location(state: GradeGl, name: string) {
  if (!state.uniforms.has(name)) state.uniforms.set(name, state.gl.getUniformLocation(state.program, name));
  return state.uniforms.get(name)!;
}

export function gradeSourceScale(width: number, height: number, sourceWidth: number, sourceHeight: number): [number, number] {
  if (![width, height, sourceWidth, sourceHeight].every((value) => Number.isFinite(value) && value > 0)) return [1, 1];
  const fit = Math.min(width / sourceWidth, height / sourceHeight);
  return [sourceWidth * fit / width, sourceHeight * fit / height];
}

export function drawGradeFrame(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  descriptor: ColorGradeFilterDescriptor,
  lut: { parsed: ParsedCubeLut; intensity: number } | null,
  sourceRecolor?: Recolor,
) {
  let state = contexts.get(canvas);
  if (!state) contexts.set(canvas, (state = createGradeGl(canvas)));
  const { gl, program } = state;
  try {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.position);
    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.sourceTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(location(state, "u_source"), 0);
    const sourceWidth = "videoWidth" in source ? source.videoWidth : "naturalWidth" in source ? source.naturalWidth : source.width;
    const sourceHeight = "videoHeight" in source ? source.videoHeight : "naturalHeight" in source ? source.naturalHeight : source.height;
    gl.uniform2fv(location(state, "u_sourceScale"), gradeSourceScale(canvas.width, canvas.height, sourceWidth, sourceHeight));
    gl.uniform2f(location(state, "u_canvasSize"), canvas.width, canvas.height);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.atlasTexture);
    if (state.atlasKey !== descriptor.atlasKey) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, ATLAS_WIDTH, ATLAS_ROW_COUNT, 0, gl.RGBA, gl.UNSIGNED_BYTE, descriptor.atlasBytes());
      state.atlasKey = descriptor.atlasKey;
    }
    gl.uniform1i(location(state, "u_atlas"), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, state.lutTexture);
    if (lut && state.lutIdentity !== lut.parsed) {
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, lut.parsed.size, lut.parsed.size, lut.parsed.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, cubeLutRgbaBytes(lut.parsed));
      state.lutIdentity = lut.parsed;
    }
    gl.uniform1i(location(state, "u_lut"), 2);

    const recolor = recolorMatrix(sourceRecolor ?? { color: "#ffffff", amount: 0, preserveShading: true });
    for (const [name, row] of [["u_recolorR", 0], ["u_recolorG", 5], ["u_recolorB", 10]] as const) gl.uniform4f(location(state, name), recolor[row]!, recolor[row + 1]!, recolor[row + 2]!, recolor[row + 4]!);
    gl.uniform1i(location(state, "u_recolorActive"), sourceRecolor && sourceRecolor.amount > 0 ? 1 : 0);

    gl.uniformMatrix3fv(location(state, "inputMatrix"), false, matrixColumns(descriptor.inputMatrix));
    gl.uniform1f(location(state, "transfer"), descriptor.transfer);
    gl.uniformMatrix3fv(location(state, "linearMatrix"), false, matrixColumns(descriptor.linearMatrix));
    gl.uniformMatrix3fv(location(state, "chromaMatrix"), false, matrixColumns(descriptor.chromaMatrix));
    gl.uniform1f(location(state, "hslActive"), descriptor.hslActive ? 1 : 0);
    gl.uniform3fv(location(state, "toneMap"), descriptor.toneMap);
    gl.uniform1f(location(state, "gamutThreshold"), descriptor.gamutThreshold);
    gl.uniform1f(location(state, "lutIntensity"), lut ? lut.intensity : 0);
    gl.uniform1f(location(state, "lutSize"), lut?.parsed.size ?? 2);
    gl.uniform3fv(location(state, "lutDomainMin"), lut?.parsed.domainMin ?? [0, 0, 0]);
    gl.uniform3fv(location(state, "lutDomainMax"), lut?.parsed.domainMax ?? [1, 1, 1]);
    // The Standard renderer draws to an 8-bit display canvas: always the SDR output transform.
    gl.uniform1f(location(state, "outputMode"), 0);
    gl.uniform1f(location(state, "displayPeak"), 1);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error(`WebGL grade rendering failed with code ${error}.`);
  } catch (error) {
    releaseGradeCanvas(canvas);
    throw error;
  }
}

/** Standard renderer's colour grade: the same float shader as CanvasKit, drawn into a WebGL2 canvas. */
export function GradeCanvasFilter({ lut, descriptor, sourceOrientationStyle, sourceRecolor, children }: { sourceRecolor?: Recolor; sourceOrientationStyle?: Pick<CSSProperties, "transform" | "transformOrigin">; lut?: ColorGradeLut | null; descriptor: ColorGradeFilterDescriptor; children: ReactNode }) {
  const passthrough = descriptor.passthrough === true && (!lut || lut.intensity === 0) && !sourceRecolor;
  const frame = useCurrentFrame();
  const { width, height, session, rendering, effectDrawMode } = useVideoConfig();
  const drawId = useId();
  const sourceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filterCanvases = useRef<HTMLCanvasElement[]>([]);
  const [parsed, setParsed] = useState<ParsedCubeLut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadHandle = useRenderResource(lut ? `LUT ${lut.assetId}:${lut.sourceUrl}` : "colour grade");

  useEffect(() => {
    if (!lut) return;
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
  }, [loadHandle, lut]);

  useEffect(() => {
    const canvas = canvasRef.current;
    return () => { if (canvas) releaseGradeCanvas(canvas); };
  }, []);

  useEffect(() => {
    if (lut && !parsed) return;
    let handle = 0;
    const draw = () => {
      // Identity must preserve the child compositor exactly, including inner SVG
      // filters. A canvas round trip can quantize otherwise unchanged pixels.
      if (passthrough) return;
      const source = (sourceRef.current?.querySelector("canvas[data-dreamcut-effect-output]") ?? sourceRef.current?.querySelector("img, video, canvas")) as HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
      const ready = source instanceof HTMLImageElement ? source.complete && source.naturalWidth > 0
        : source instanceof HTMLVideoElement ? source.readyState >= 2 && !source.seeking && source.videoWidth > 0
          : source instanceof HTMLCanvasElement ? source.width > 0 : false;
      if (!source || !ready || !canvasRef.current) {
        if (rendering) throw new Error("Source frame was not ready for colour grading.");
        return;
      }
      // drawImage samples pixels, not the element's ancestor CSS filters. Replay the existing
      // inner filter chain before grading instead of dropping it.
      const filters: string[] = [];
      for (let node: HTMLElement | null = source; node && node !== sourceRef.current; node = node.parentElement) {
        const filter = getComputedStyle(node).filter;
        if (filter && filter !== "none") filters.push(filter);
      }
      let input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement = source;
      if (filters.length) {
        const sw = source instanceof HTMLVideoElement ? source.videoWidth : source instanceof HTMLImageElement ? source.naturalWidth : source.width;
        const sh = source instanceof HTMLVideoElement ? source.videoHeight : source instanceof HTMLImageElement ? source.naturalHeight : source.height;
        const [sx, sy] = gradeSourceScale(width, height, sw, sh);
        for (let index = 0; index < filters.length; index++) {
          const slot = index % 2;
          const canvas = filterCanvases.current[slot] ?? (filterCanvases.current[slot] = document.createElement("canvas"));
          canvas.width = width; canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) throw Error("Canvas2D unavailable for pre-grade effects.");
          context.filter = filters[index]!;
          if (index === 0) context.drawImage(input, (1 - sx) * width / 2, (1 - sy) * height / 2, sx * width, sy * height);
          else context.drawImage(input, 0, 0);
          input = canvas;
        }
      }
      drawGradeFrame(canvasRef.current, input, descriptor, lut && parsed ? { parsed, intensity: lut.intensity } : null, filters.length ? undefined : sourceRecolor);
    };
    session.draws.set(drawId, draw);
    loadHandle.done();
    const preview = () => {
      try { draw(); } catch (cause) { session.fail(cause); setError(String(cause)); return; }
      handle = requestAnimationFrame(preview);
    };
    if (!rendering && effectDrawMode !== "settled") handle = requestAnimationFrame(preview);
    return () => { cancelAnimationFrame(handle); session.draws.delete(drawId); };
  }, [passthrough, descriptor, frame, lut, parsed, sourceRecolor, session, drawId, rendering, effectDrawMode, loadHandle, width, height]);

  return (
    <AbsoluteFill>
      <AbsoluteFill ref={sourceRef} style={{ opacity: passthrough ? 1 : 0, pointerEvents: "none" }}>{children}</AbsoluteFill>
      {/* Sampling the child canvas does not capture its ancestor CSS orientation. */}
      <canvas data-color-grade-output data-color-grade-lut-output ref={canvasRef} width={width} height={height} style={{ width: "100%", height: "100%", display: passthrough ? "none" : "block", ...sourceOrientationStyle }} />
      {error ? <div role="alert" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, background: "#171717", color: "#ffffff", fontSize: 20, textAlign: "center" }}>{error}</div> : null}
    </AbsoluteFill>
  );
}

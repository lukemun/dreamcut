import { resolveTransitionEffects } from "./transition-effects";
import { EFFECT_CONTROLS } from './effect-controls';
import type { CSSProperties } from 'react';
import { resolveMediaTransformAtTime, resolveMaskInsetAtTime, resolveMediaEffectAtTime, maskInsetStyle, readLineMaskRotation } from './media-transform';
import { readSourceCanvasRect, resolveCompositionTransformLayout, projectSourceToComposition, SOURCE_CANVAS_TRACK_PROP, type SourceProjectionInput } from './source-projection';
import { resolveSurfacePlaneProps } from './surface-plane';
import { resolveColorGradeAtTime, validateColorGradeModel } from './color-grade';
import { readKeyframeMap } from './keyframes';

export const MEDIA_SCENE_VERSION = 'media-scene-v1';
/** Closed wrapper order, shared by renderer and assessment. Legacy pixel content
 * remains inside this wrapper, with explicitly limited assessment support. */
export const MEDIA_SCENE_ORDER = ['mask-opacity', 'translate', 'scale', 'surface', 'color'] as const;
const capabilities = EFFECT_CONTROLS.map(control => ({ prop: control.prop, spatial: control.spatial }));
export function resolveSourceOrientation(props:Record<string,unknown>|null|undefined){
  return {degrees:props?.media_orientation==='clockwise'?90:props?.media_orientation==='counterclockwise'?-90:0,
    mirrorX:props?.media_mirror==='horizontal'?-1:1};
}
/** Wider than the keyframe resolver's exact-match epsilon (0.5 ms), so a time this far outside every point matches none. */
const HOLD_MARGIN_SECONDS = 0.001;
/**
 * For clip props, which stretch of clip time a time is in, for a scene that is the same throughout it (apart
 * from the lazily read grade): 'always' with no keyframes that change a value, 'before' every changing keyframe
 * or 'after' them all, where each field holds its first or last value. Null between keyframes, or when a window opening or source canvas
 * track moves the scene. Geometry checks resolve one scene per stretch instead of one per sampled time.
 */
export type MediaSceneHold = 'always' | 'before' | 'after' | null;
export function mediaSceneHolds(props: Record<string, unknown> | null | undefined): (time: number) => MediaSceneHold {
  if (Number(props?.window_open_duration) > 0 || props?.[SOURCE_CANVAS_TRACK_PROP] != null) return () => null;
  let first = Infinity, last = -Infinity;
  for (const points of Object.values(readKeyframeMap(props))) {
    // A field keyed to one value everywhere resolves to it (v + 0 × progress) at every time.
    const value = JSON.stringify(points[0]!.v);
    if (points.every(point => JSON.stringify(point.v) === value)) continue;
    for (const point of points) { first = Math.min(first, point.t); last = Math.max(last, point.t); }
  }
  if (first === Infinity) return () => 'always';
  return (time) => {
    const at = Math.max(0, time);
    return at < first - HOLD_MARGIN_SECONDS ? 'before' : at > last + HOLD_MARGIN_SECONDS ? 'after' : null;
  };
}
export function resolveMediaScene(props: Record<string, unknown> | null | undefined, time: number, canvas: { width: number; height: number }) {
  const transition = resolveTransitionEffects(props, time, canvas);
  const transform = resolveMediaTransformAtTime(props, time);
  const mask = resolveMaskInsetAtTime(props, time);
  const effect = resolveMediaEffectAtTime(props, time);
  const surface = resolveSurfacePlaneProps(props);
  // An unsupported grade still fails here, as when the grade was resolved up front.
  const gradeIssue = validateColorGradeModel(props);
  if (gradeIssue) throw new Error(gradeIssue);
  const layout = resolveCompositionTransformLayout({ composition_width: canvas.width, composition_height: canvas.height,
    media_scale: transform.scale, media_offset_x: transform.offsetX, media_offset_y: transform.offsetY, mask_inset: mask });
  const attached = surface.mode === 'wall';
  const orientation=resolveSourceOrientation(props);
  const unsupported: string[] = [];
  for (const control of EFFECT_CONTROLS) {
    if (control.spatial === 'pixel_dependent' && props?.[control.prop] != null
      && JSON.stringify(props[control.prop]) !== JSON.stringify(control.identity)) unsupported.push(`${control.prop} requires pixel analysis`);
  }
  if (transition.active) unsupported.push('oval reveal or transition blur requires pixel analysis');
  if (attached) unsupported.push('surface perspective, skew, blur or blend');
  if (effect.maskFeather > 0) unsupported.push('feathered mask');
  if (readLineMaskRotation(props) !== 0) unsupported.push('rotated line mask');
  if (props?.media_shadow || props?.has_alpha) unsupported.push('image-dependent alpha or shadow');
  if (props?.chroma_key_color) unsupported.push('image-dependent chroma alpha');
  if (props?.media_orientation === 'clockwise' || props?.media_orientation === 'counterclockwise') unsupported.push('source orientation');
  if (props?.media_mirror === 'horizontal') unsupported.push('source mirror');
  if (props?.flip_horizontal || props?.flip_x || props?.flip_vertical || props?.flip_y) unsupported.push('source flip');
  // Effects inside legacy content/transition wrappers cannot inherit analytic support.
  for (const key of Object.keys(props ?? {})) {
    if (key === 'effect_role') continue; // semantic catalog metadata; it has no rendered geometry
    if (/^(effect_|motion_|cameraReveal|animation|transition|corner_|perspective)/.test(key)
      && props?.[key] != null && props[key] !== false && props[key] !== 'none' && props[key] !== 0) unsupported.push(`legacy ${key}`);
  }
  const styles: { outer: CSSProperties; translate: CSSProperties; scale: CSSProperties; mirror: CSSProperties; surface: CSSProperties; transition: CSSProperties; edgeBlur: CSSProperties } = {
    mirror: orientation.degrees!==0||orientation.mirrorX!==1 ? { transform: `rotate(${orientation.degrees}deg) scaleX(${orientation.mirrorX})`, transformOrigin: 'center center' } : {},
    transition: transition.style,
    edgeBlur: transition.edgeStyle,
    outer: { overflow: 'hidden', opacity: effect.opacity * surface.opacity, ...maskInsetStyle(mask, effect.maskFeather, readLineMaskRotation(props), canvas, effect.maskCornerRadius) },
    translate: layout.translate_x !== 0 || layout.translate_y !== 0 ? { transform: `translate(${layout.translate_x}px, ${layout.translate_y}px)` } : {},
    scale: layout.scale !== 1 ? { transform: `scale(${layout.scale})`, transformOrigin: 'center center' } : {},
    surface: attached ? {
      transform: `perspective(${surface.perspectivePx}px) translateZ(${surface.depthPx}px) rotateX(${surface.rotateXDeg}deg) rotateY(${surface.rotateYDeg}deg) rotateZ(${surface.rotateZDeg}deg) skew(${surface.skewXDeg}deg, ${surface.skewYDeg}deg)`,
      transformOrigin: 'center center', transformStyle: 'preserve-3d', mixBlendMode: surface.blendMode,
      filter: surface.blurPx > 0.01 ? `blur(${surface.blurPx}px)` : undefined,
    } : {},
  };
  // Only the renderer reads the grade; geometry checks resolve many scenes per card and never need it.
  let grade: ReturnType<typeof resolveColorGradeAtTime> | undefined;
  return { capabilities, version: MEDIA_SCENE_VERSION, order: MEDIA_SCENE_ORDER, transform, mask, effect, surface,
    get grade() { return grade ??= resolveColorGradeAtTime(props, time); }, layout, styles,
    // Spatial checks read the crop window at clip time, which is its source time for an untrimmed clip.
    canvasRect: readSourceCanvasRect(props, time), directionalBlur: { x: transition.blurX, y: transition.blurY },
    opacity: effect.opacity * surface.opacity,
    geometry_support: unsupported.length ? 'unknown' as const : 'analytic' as const,
    unsupported: [...new Set(unsupported)], contrast_support: 'unmeasured' as const };
}

export function projectMediaScene(scene: ReturnType<typeof resolveMediaScene>, source: Omit<SourceProjectionInput,
  'media_scale' | 'media_offset_x' | 'media_offset_y' | 'mask_inset'>) {
  return projectSourceToComposition({ source_canvas_rect: scene.canvasRect, ...source, media_scale: scene.transform.scale,
    media_offset_x: scene.transform.offsetX, media_offset_y: scene.transform.offsetY, mask_inset: scene.mask });
}

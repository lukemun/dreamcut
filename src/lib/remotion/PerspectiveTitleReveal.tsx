"use client";

import { ThreeCanvas } from "@/lib/frame-runtime/three";
import {
  type EventManager,
  useLoader,
  useThree,
} from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill,
  useRenderResource,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "@/lib/frame-runtime";
import {
  Color,
  DoubleSide,
  ExtrudeGeometry,
  LinearFilter,
  PerspectiveCamera,
  ShapeGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  Texture,
  TextureLoader,
} from "three";

import {
  captionRemotionFontFamily,
  type CaptionElementProps,
} from "@/lib/timeline/captions";
import {
  RASTER_FONT_SIZE,
  rasterizeTextToShapes,
} from "@/lib/remotion/font-contour-geometry";
import { ensureRequiredRemotionFonts } from "@/lib/remotion/google-fonts";
import { getSharedFont } from "@/lib/fonts/registry";

import { cameraRevealBlurPixels, resolveCameraRevealState, type CameraRevealState } from "@/lib/timeline/camera-reveal";

const FALLBACK_TEXTURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==";

const disabledThreeEvents = (): EventManager<HTMLElement> => ({
  enabled: false,
  priority: 0,
});

function StableCameraMotionBlur({
  props,
  shutterAngle,
  samples,
}: {
  props: CaptionElementProps;
  shutterAngle: number;
  samples: number;
}) {
  const currentFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const blurPixels = cameraRevealBlurPixels({ props, frame: currentFrame, fps, shutterAngle, samples });

  return (
    <AbsoluteFill
      style={{
        filter: blurPixels > 0 ? `blur(${blurPixels}px)` : undefined,
        transform: blurPixels > 0 ? "scale(1.002)" : undefined,
      }}
    >
      <PerspectiveTitleRevealFrame props={props} frame={currentFrame} />
    </AbsoluteFill>
  );
}

function splitWordmark(text: string) {
  const explicit = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (explicit.length > 1) return explicit.slice(0, 3);

  const compact = (explicit[0] ?? text).trim();
  if (compact.includes(" ")) return compact.split(/\s+/).slice(0, 3);
  if (compact.length > 8) {
    const splitAt = Math.max(3, Math.round(compact.length * 0.42));
    return [compact.slice(0, splitAt), compact.slice(splitAt)];
  }
  return [compact || "TITLE"];
}

function textureAspect(texture: Texture) {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = image?.width ?? 1;
  const height = image?.height ?? 1;
  return width > 0 && height > 0 ? width / height : 1;
}

function CameraRig({
  cameraState,
  fov,
}: {
  cameraState: CameraRevealState;
  fov: number;
}) {
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    camera.position.set(
      cameraState.targetX + cameraState.orbitX,
      cameraState.targetY + cameraState.orbitY,
      cameraState.distance,
    );
    camera.lookAt(cameraState.targetX, cameraState.targetY, 0);
    if ("fov" in camera) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, [camera, cameraState, fov]);
  return null;
}

function LoadedWordmarkMesh(props: Omit<Parameters<typeof WordmarkMesh>[0], "textures">) {
  const textures = useLoader(TextureLoader, props.props.mediaFillUrls.length ? props.props.mediaFillUrls : [FALLBACK_TEXTURE]);
  return <WordmarkMesh {...props} textures={textures} />;
}

function WordmarkMesh({
  props,
  width,
  height,
  frame,
  cameraState,
  textures,
}: {
  props: CaptionElementProps;
  width: number;
  height: number;
  frame?: number;
  cameraState: CameraRevealState;
  textures: Texture[];
}) {
  const currentFrame = useCurrentFrame();
  const sampledFrame = frame ?? currentFrame;
  const { fps } = useVideoConfig();
  const fontFamily = captionRemotionFontFamily(props.fontPreset);
  const fontWeight = props.cameraRevealFontWeight;
  const fontKey = `${props.fontPreset}:${fontWeight}:${fontFamily}`;

  for (const texture of textures) {
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
  }

  const localSeconds = sampledFrame / fps;
  const hold = Math.max(0.001, props.mediaFillSecondsPerImage);
  const changeTimes = props.mediaFillChangeTimesSeconds;
  const scheduledIndex = changeTimes.length > 0
    ? Math.max(0, changeTimes.findLastIndex((time) => time <= localSeconds))
    : -1;
  const scheduledStart = scheduledIndex >= 0 ? (changeTimes[scheduledIndex] ?? 0) : 0;
  const scheduledEnd = scheduledIndex >= 0 ? changeTimes[scheduledIndex + 1] : undefined;
  const scheduledDuration = scheduledEnd === undefined ? null : Math.max(0.001, scheduledEnd - scheduledStart);
  const slot = Math.max(0, localSeconds / hold);
  const slotIndex = Math.floor(slot);
  const uniformSlotProgress = slot - slotIndex;
  const slotProgress = scheduledIndex >= 0
    ? scheduledDuration === null
      ? 0.5
      : Math.max(0, Math.min(1, (localSeconds - scheduledStart) / scheduledDuration))
    : uniformSlotProgress;
  const currentIndex = scheduledIndex >= 0
    ? Math.min(scheduledIndex, textures.length - 1)
    : slotIndex % textures.length;
  const nextIndex = scheduledIndex >= 0
    ? Math.min(scheduledIndex + 1, textures.length - 1)
    : (currentIndex + 1) % textures.length;
  const transitionDuration = Math.min(
    scheduledDuration === null ? 0 : scheduledDuration * 0.95,
    props.mediaFillCrossfadeSeconds,
  );
  const protectOpeningImage = scheduledIndex === 0 && props.mediaFillFirstTransition === "cut";
  const transitionProgress = scheduledIndex >= 0
    ? scheduledEnd !== undefined && transitionDuration > 0
      ? protectOpeningImage
        ? 0
        : Math.max(0, Math.min(1, (localSeconds - (scheduledEnd - transitionDuration)) / transitionDuration))
      : 0
    : (() => {
        const fadeFraction = Math.min(0.95, props.mediaFillCrossfadeSeconds / hold);
        return fadeFraction > 0
          ? Math.max(0, Math.min(1, (slotProgress - (1 - fadeFraction)) / fadeFraction))
          : 0;
      })();
  const mixAmount = props.mediaFillTransition === "dissolve" ? transitionProgress : 0;
  const slideProgress = props.mediaFillTransition === "slide" ? transitionProgress : 0;
  const slideDirection = props.mediaFillSlideDirection === "right"
    ? [-1, 0]
    : props.mediaFillSlideDirection === "up"
      ? [0, 1]
      : props.mediaFillSlideDirection === "down"
        ? [0, -1]
        : [1, 0];
  const pan = (props.mediaFillPanPercent / 100) * (slotProgress * 2 - 1);
  const resolveEnabled = props.cameraRevealResolveMode === "brand_card";
  const resolveDuration = Math.max(0.05, props.cameraRevealResolveDurationSeconds);
  const resolveBackgroundProgress = resolveEnabled
    ? interpolate(
        localSeconds,
        [
          props.cameraRevealResolveStartSeconds,
          props.cameraRevealResolveStartSeconds + resolveDuration * 0.68,
        ],
        [0, 1],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.22, 0.8, 0.35, 1),
        },
      )
    : 0;
  // The reference establishes its colour field while the montage is still
  // alive inside the glyphs. Delay the solid fill so the ending reads as a
  // takeover of the same wordmark geometry rather than a card cut.
  const resolveTextProgress = resolveEnabled
    ? interpolate(
        localSeconds,
        [
          props.cameraRevealResolveStartSeconds + resolveDuration * 0.24,
          props.cameraRevealResolveStartSeconds + resolveDuration,
        ],
        [0, 1],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.22, 0.8, 0.35, 1),
        },
      )
    : 0;
  const resolvedBackgroundColor = new Color("#000000")
    .lerp(new Color(props.cameraRevealResolveBackgroundColor), resolveBackgroundProgress)
    .getStyle();
  const planeHeight = 5;
  const planeWidth = planeHeight * (width / height);
  const geometries = useMemo(() => {
    const lines = splitWordmark(props.text);
    const depth = Math.max(0.001, props.cameraRevealExtrusionDepth * 0.58);
    const bevelSize = 0.012 + props.cameraRevealBevelWidth * 0.075;
    const isFlat = props.cameraRevealExtrusionDepth === 0;
    const outlines = lines.map((line) => rasterizeTextToShapes({
      text: line.toUpperCase(),
      fontFamily,
      fontWeight,
    }));
    const flatGeometries = outlines.map((shapes) => new ShapeGeometry(shapes, 16));
    flatGeometries.forEach((geometry) => geometry.computeBoundingBox());
    const maxRawWidth = Math.max(...flatGeometries.map((geometry) => {
      const box = geometry.boundingBox!;
      return box.max.x - box.min.x;
    }));
    const rawHeights = flatGeometries.map((geometry) => {
      const box = geometry.boundingBox!;
      return box.max.y - box.min.y;
    });
    const endViewHeight = 2
      * props.cameraRevealEndDistance
      * Math.tan((props.cameraRevealFov * Math.PI) / 360);
    const endWorldUnitsPerPixel = endViewHeight / height;
    const preserveFontSize =
      props.cameraRevealTypographySizing === "font_size";
    const fontMetricScale =
      (props.fontSizePx / RASTER_FONT_SIZE) * endWorldUnitsPerPixel;
    const xScale = preserveFontSize
      ? fontMetricScale * props.textScaleX
      : (planeWidth * 0.9) / Math.max(0.001, maxRawWidth);
    // Normalize each line from its own real glyph bounds. Uppercase words can
    // have slightly different font bounding boxes even at the same point size;
    // using one shared Y scale made a two-line wordmark look mismatched.
    const yScales = rawHeights.map((rawHeight) =>
      preserveFontSize
        ? fontMetricScale * props.textScaleY
        : 1.12 / Math.max(0.001, rawHeight),
    );
    const raw = outlines.map((shapes, index) => {
      const yScale = yScales[index]!;
      const rawBevelSize = bevelSize / Math.max(0.0001, Math.min(xScale, yScale));
      const geometry = isFlat
        ? flatGeometries[index]!
        : new ExtrudeGeometry(shapes, {
            depth,
            curveSegments: 12,
            steps: 1,
            bevelEnabled: props.cameraRevealBevelWidth > 0,
            bevelThickness: bevelSize * 0.72,
            bevelSize: rawBevelSize,
            bevelOffset: 0,
            bevelSegments: 8,
          });
      geometry.computeBoundingBox();
      return geometry;
    });
    const lineSpacing = lines.length === 1
      ? 0
      : preserveFontSize
        ? props.fontSizePx * 1.143 * endWorldUnitsPerPixel
        : 1.23;
    const wordmarkOffsetX = preserveFontSize
      ? props.offsetX * endWorldUnitsPerPixel
      : 0;
    const wordmarkOffsetY = preserveFontSize
      ? -props.offsetY * endWorldUnitsPerPixel
      : 0;
    raw.forEach((geometry, index) => {
      geometry.scale(xScale, yScales[index]!, 1);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const centerX = (box.min.x + box.max.x) / 2;
      const centerY = (box.min.y + box.max.y) / 2;
      const lineY = ((lines.length - 1) / 2 - index) * lineSpacing;
      // ExtrudeGeometry extends toward +Z. Move its front cap back to z=0 so
      // the physical walls extend away from the camera rather than swallowing
      // the close starting camera.
      geometry.translate(
        wordmarkOffsetX - centerX,
        wordmarkOffsetY + lineY - centerY,
        -box.max.z,
      );
      geometry.computeVertexNormals();
    });
    return raw;
  }, [
    fontFamily,
    fontKey,
    fontWeight,
    planeWidth,
    props.cameraRevealEndDistance,
    props.cameraRevealFov,
    props.cameraRevealBevelWidth,
    props.cameraRevealExtrusionDepth,
    props.cameraRevealTypographySizing,
    props.fontSizePx,
    props.offsetX,
    props.offsetY,
    props.text,
    props.textScaleX,
    props.textScaleY,
    height,
  ]);
  useEffect(
    () => () => geometries.forEach((geometry) => geometry.dispose()),
    [geometries],
  );

  const material = useMemo(() => new ShaderMaterial({
    transparent: false,
    side: DoubleSide,
    uniforms: {
      currentMap: { value: textures[currentIndex] },
      nextMap: { value: textures[nextIndex] },
      mixAmount: { value: mixAmount },
      currentAspect: { value: textureAspect(textures[currentIndex]!) },
      nextAspect: { value: textureAspect(textures[nextIndex]!) },
      planeAspect: { value: width / height },
      planeWidth: { value: planeWidth },
      planeHeight: { value: planeHeight },
      cameraFit: { value: props.cameraRevealMediaFit === "camera" ? 1 : 0 },
      cameraTarget: { value: [props.cameraRevealTargetX, props.cameraRevealTargetY] },
      cameraViewSize: { value: [1, 1] },
      fillScale: { value: props.mediaFillScale },
      pan: { value: pan },
      transitionMode: { value: props.mediaFillTransition === "slide" ? 1 : 0 },
      slideProgress: { value: slideProgress },
      slideDirection: { value: slideDirection },
      transitionBlur: { value: props.mediaFillTransitionBlur },
      edgeLight: { value: props.cameraRevealEdgeLight },
      edgeColor: { value: new Color(props.cameraRevealEdgeColor) },
      wallMirror: { value: props.cameraRevealWallMirror },
      resolveTextProgress: { value: resolveTextProgress },
      resolveTextColor: { value: new Color(props.cameraRevealResolveTextColor) },
    },
    vertexShader: `
      varying vec3 vObjectPosition;
      varying vec3 vObjectNormal;
      void main() {
        vObjectPosition = position;
        vObjectNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D currentMap;
      uniform sampler2D nextMap;
      uniform sampler2D maskMap;
      uniform float mixAmount;
      uniform float currentAspect;
      uniform float nextAspect;
      uniform float planeAspect;
      uniform float planeWidth;
      uniform float planeHeight;
      uniform float cameraFit;
      uniform vec2 cameraTarget;
      uniform vec2 cameraViewSize;
      uniform float fillScale;
      uniform float pan;
      uniform float transitionMode;
      uniform float slideProgress;
      uniform vec2 slideDirection;
      uniform float transitionBlur;
      uniform float edgeLight;
      uniform vec3 edgeColor;
      uniform float wallMirror;
      uniform float resolveTextProgress;
      uniform vec3 resolveTextColor;
      varying vec3 vObjectPosition;
      varying vec3 vObjectNormal;

      vec2 coverUv(vec2 uv, float imageAspect) {
        vec2 result = (uv - 0.5) / fillScale + 0.5;
        if (imageAspect > planeAspect) {
          result.x = (result.x - 0.5) * (planeAspect / imageAspect) + 0.5;
        } else {
          result.y = (result.y - 0.5) * (imageAspect / planeAspect) + 0.5;
        }
        result.x += pan;
        return result;
      }

      vec3 slideMontage(vec2 titleUv, float progress) {
        vec2 currentUv = titleUv + slideDirection * progress;
        vec2 nextUv = titleUv - slideDirection * (1.0 - progress);
        vec3 currentColor = texture2D(currentMap, coverUv(currentUv, currentAspect)).rgb;
        vec3 nextColor = texture2D(nextMap, coverUv(nextUv, nextAspect)).rgb;
        float nextVisible = step(0.0, nextUv.x)
          * step(nextUv.x, 1.0)
          * step(0.0, nextUv.y)
          * step(nextUv.y, 1.0);
        return mix(currentColor, nextColor, nextVisible);
      }

      void main() {
        vec2 wordmarkUv = vec2(
          vObjectPosition.x / planeWidth + 0.5,
          vObjectPosition.y / planeHeight + 0.5
        );
        vec2 cameraUv = vec2(
          (vObjectPosition.x - cameraTarget.x) / cameraViewSize.x + 0.5,
          (vObjectPosition.y - cameraTarget.y) / cameraViewSize.y + 0.5
        );
        vec2 titleUv = mix(wordmarkUv, cameraUv, cameraFit);
        vec3 currentColor = texture2D(currentMap, coverUv(titleUv, currentAspect)).rgb;
        vec3 nextColor = texture2D(nextMap, coverUv(titleUv, nextAspect)).rgb;
        vec3 montage = mix(currentColor, nextColor, mixAmount);
        if (transitionMode > 0.5) {
          float blurSpan = transitionBlur * 0.18;
          montage = (
            slideMontage(titleUv, clamp(slideProgress - blurSpan, 0.0, 1.0))
            + slideMontage(titleUv, clamp(slideProgress - blurSpan * 0.66, 0.0, 1.0))
            + slideMontage(titleUv, clamp(slideProgress - blurSpan * 0.33, 0.0, 1.0))
            + slideMontage(titleUv, slideProgress)
            + slideMontage(titleUv, clamp(slideProgress + blurSpan * 0.33, 0.0, 1.0))
            + slideMontage(titleUv, clamp(slideProgress + blurSpan * 0.66, 0.0, 1.0))
            + slideMontage(titleUv, clamp(slideProgress + blurSpan, 0.0, 1.0))
          ) / 7.0;
        }
        vec3 n = normalize(vObjectNormal);
        float frontFace = smoothstep(0.72, 0.995, n.z);
        float bevelFace = smoothstep(0.08, 0.78, n.z) * (1.0 - frontFace);
        float reflectionWave = 0.5 + 0.5 * sin(
          vObjectPosition.x * 10.0 + vObjectPosition.y * 17.0 - vObjectPosition.z * 24.0
        );
        float reflectionBand = pow(reflectionWave, 10.0);
        float silverBase = 0.78 + 0.12 * edgeLight;
        float normalLight = 0.72 + 0.28 * abs(dot(n.xy, normalize(vec2(-0.65, 0.76))));
        vec3 wall = edgeColor * silverBase * normalLight;
        wall = mix(wall, vec3(1.0), reflectionBand * 0.82 * wallMirror);
        wall = mix(wall, vec3(0.78, 0.86, 0.98), (1.0 - reflectionWave) * 0.12 * wallMirror);
        vec3 bevel = mix(wall, montage, bevelFace * 0.22);
        vec3 result = mix(wall, bevel, bevelFace);
        result = mix(result, montage, frontFace);
        result = mix(result, resolveTextColor, resolveTextProgress);
        gl_FragColor = vec4(result, 1.0);
      }
    `,
  }), [height, planeHeight, planeWidth, textures, width]);

  useEffect(() => () => material.dispose(), [material]);

  material.uniforms.currentMap.value = textures[currentIndex];
  material.uniforms.nextMap.value = textures[nextIndex];
  material.uniforms.mixAmount.value = mixAmount;
  material.uniforms.currentAspect.value = textureAspect(textures[currentIndex]!);
  material.uniforms.nextAspect.value = textureAspect(textures[nextIndex]!);
  material.uniforms.planeAspect.value = width / height;
  material.uniforms.planeWidth.value = planeWidth;
  material.uniforms.planeHeight.value = planeHeight;
  material.uniforms.fillScale.value = props.mediaFillScale;
  material.uniforms.pan.value = pan;
  material.uniforms.transitionMode.value = props.mediaFillTransition === "slide" ? 1 : 0;
  material.uniforms.slideProgress.value = slideProgress;
  material.uniforms.slideDirection.value = slideDirection;
  material.uniforms.transitionBlur.value = props.mediaFillTransitionBlur;
  material.uniforms.edgeLight.value = props.cameraRevealEdgeLight;
  material.uniforms.edgeColor.value.set(props.cameraRevealEdgeColor);
  material.uniforms.wallMirror.value = props.cameraRevealWallMirror;
  material.uniforms.resolveTextProgress.value = resolveTextProgress;
  material.uniforms.resolveTextColor.value.set(props.cameraRevealResolveTextColor);

  material.uniforms.cameraFit.value = props.cameraRevealMediaFit === "camera" ? 1 : 0;
  material.uniforms.cameraTarget.value = [cameraState.targetX, cameraState.targetY];
  material.uniforms.cameraViewSize.value = [cameraState.viewWidth, cameraState.viewHeight];

  return (
    <>
      <color attach="background" args={[resolvedBackgroundColor]} />
      {geometries.map((geometry, index) => (
        <mesh key={`${fontKey}-${props.text}-${index}`} geometry={geometry} material={material} />
      ))}
    </>
  );
}

export function PerspectiveTitleRevealFrame({
  props,
  frame,
  textures,
  pixelRatio,
  onFrameReady,
}: {
  props: CaptionElementProps;
  frame?: number;
  textures?: Texture[];
  pixelRatio?: number;
  onFrameReady?: (canvas: HTMLCanvasElement) => void;
}) {
  const currentFrame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const sampledFrame = frame ?? currentFrame;
  const cameraState = resolveCameraRevealState({
    props,
    frame: sampledFrame,
    fps,
    width,
    height,
  });
  // Feed the fully resolved pose to ThreeCanvas itself. A child-side camera
  // mutation can require a second browser paint, which the live Player gets
  // but a one-frame Remotion export does not.
  const posedCamera = new PerspectiveCamera(
    props.cameraRevealFov,
    width / height,
    0.01,
    100,
  );
  posedCamera.position.set(
    cameraState.targetX + cameraState.orbitX,
    cameraState.targetY + cameraState.orbitY,
    cameraState.distance,
  );
  posedCamera.lookAt(cameraState.targetX, cameraState.targetY, 0);
  return (
    <ThreeCanvas
      resize={{ offsetSize: true }}
      onFrameReady={onFrameReady}
      dpr={pixelRatio}
      width={width}
      height={height}
      camera={{
        fov: props.cameraRevealFov,
        near: 0.01,
        far: 100,
        position: [
          posedCamera.position.x,
          posedCamera.position.y,
          posedCamera.position.z,
        ],
        rotation: [
          posedCamera.rotation.x,
          posedCamera.rotation.y,
          posedCamera.rotation.z,
        ],
      }}
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      events={disabledThreeEvents}
      style={{ width: "100%", height: "100%" }}
    >
      <CameraRig cameraState={cameraState} fov={props.cameraRevealFov} />
      {textures ? <WordmarkMesh props={props} width={width} height={height} frame={sampledFrame} cameraState={cameraState} textures={textures} />
        : <LoadedWordmarkMesh props={props} width={width} height={height} frame={sampledFrame} cameraState={cameraState} />}
    </ThreeCanvas>
  );
}

export function PerspectiveTitleReveal({
  props,
}: {
  props: CaptionElementProps;
}) {
  const fontFamily = captionRemotionFontFamily(props.fontPreset);
  const fontWeight = props.cameraRevealFontWeight;
  const fontKey = `${props.fontPreset}:${fontWeight}:${fontFamily}`;
  const resourceKey = `${fontKey}:${props.text}`;
  const [readyFontKey, setReadyFontKey] = useState("");
  const fontLoadHandle = useRenderResource(`3D title font: ${resourceKey}`);
  // Hand readiness to the mounted ThreeCanvas in the same commit. Releasing
  // before setState commits can let a new caption publish its black placeholder.
  useLayoutEffect(() => {
    if (readyFontKey === resourceKey) fontLoadHandle.done();
  }, [readyFontKey, resourceKey, fontLoadHandle]);
  useEffect(() => {
    let cancelled = false;
    setReadyFontKey("");
    const finishFontLoad = () => {
      if (cancelled) return;
      setReadyFontKey(resourceKey);
    };
    if (!document.fonts) {
      finishFontLoad();
      return () => {
        cancelled = true;
      };
    }
    // document.fonts.load() resolves immediately against a fallback when the
    // named face has not been registered yet. In the editor Next has already
    // registered its fonts, while the standalone Remotion bundle is still
    // loading them. Await that registration first so the exported glyph
    // contours are rasterized from the same face as the live preview.
    void ensureRequiredRemotionFonts([getSharedFont(props.fontPreset).family])
      .then(() => document.fonts.load(`${fontWeight} 160px ${fontFamily}`, props.text))
      .then(finishFontLoad)
      .catch(error => { if (!cancelled) fontLoadHandle.fail(error); });
    return () => {
      cancelled = true;
    };
  }, [fontFamily, resourceKey, fontLoadHandle, fontWeight, props.text, props.fontPreset]);
  if (readyFontKey !== resourceKey) {
    return <AbsoluteFill style={{ backgroundColor: "#000000" }} />;
  }
  return (
    <StableCameraMotionBlur
      props={props}
      shutterAngle={props.cameraRevealShutterAngle}
      samples={props.cameraRevealBlurSamples}
    />
  );
}

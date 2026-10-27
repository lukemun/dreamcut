import { resolveNumberKeyframe } from "./keyframes";
import { resolveMediaTransformAtTime } from "./media-transform";

/**
 * Camera: a view of the canvas that any visual element can follow by naming the camera in its
 * `camera_id` prop. A push-in or pan then moves every follower together while each stays its own
 * element, with its own timing and settings. The camera is a timeline clip so the creator can see,
 * retime and keyframe it like anything else; today it is stored as a shape of kind `camera`, which
 * draws nothing.
 *
 * The camera's Horizontal and Vertical (`media_offset_x/y`, half-canvas units) are the point it
 * looks at, Size (`media_scale`) is the zoom and Rotation (`media_rotation`, degrees) turns the
 * view. It follows the timeline clock; outside its clip its first or last view holds.
 *
 * Followers: shapes, stills, video clips (motion graphics included) and native text. Shapes map
 * their placement through `cameraPoint`; everything else is drawn through `cameraMatrix` as its
 * outermost transform, after its own animation, masks and effects, in both renderers.
 */
export type CameraView = { focusX: number; focusY: number; zoom: number; rotationDeg: number };
export type CameraElement = { id: string; type: string; timeline_start: number; duration: number; props?: Record<string, unknown> | null; removed_at?: unknown };

export const isCamera = (element: Pick<CameraElement, "type" | "props">) =>
  element.type === "shape" && element.props?.shape_kind === "camera";

/** The camera an element follows, or null when it names none or the camera is gone. */
export function cameraFor<T extends CameraElement>(element: Pick<CameraElement, "props">, elements: readonly T[]): T | null {
  const id = element.props?.camera_id;
  if (typeof id !== "string") return null;
  return elements.find((candidate) => candidate.id === id && !candidate.removed_at && isCamera(candidate)) ?? null;
}

const ROTATION = { min: -720, max: 720 };
/**
 * A camera may zoom past a picture's own 3× size limit, far enough to fill the frame with a
 * small part of the footage (a sign, a screen) before a cut.
 */
export const CAMERA_ZOOM = { min: 0.1, max: 10 };

/** The camera's zoom at clip-local second `local`, within CAMERA_ZOOM. */
export function cameraZoomAt(props: CameraElement["props"], local: number) {
  const still = typeof props?.media_scale === "number" && Number.isFinite(props.media_scale) ? props.media_scale : 1;
  return resolveNumberKeyframe(props, "media_scale", local, Math.min(CAMERA_ZOOM.max, Math.max(CAMERA_ZOOM.min, still)), CAMERA_ZOOM);
}

/** The camera's view at timeline second `timelineSeconds`, on a `width` × `height` canvas. */
export function cameraViewAt(camera: CameraElement, timelineSeconds: number, width: number, height: number): CameraView {
  const local = Math.min(Math.max(0, camera.duration), Math.max(0, timelineSeconds - camera.timeline_start));
  const transform = resolveMediaTransformAtTime(camera.props, local);
  const rotation = typeof camera.props?.media_rotation === "number" ? camera.props.media_rotation : 0;
  return {
    focusX: width / 2 + transform.offsetX * width / 2,
    focusY: height / 2 + transform.offsetY * height / 2,
    zoom: cameraZoomAt(camera.props, local),
    rotationDeg: resolveNumberKeyframe(camera.props, "media_rotation", local, rotation, ROTATION),
  };
}

/** The view an element is drawn through at `timelineSeconds`, or null when it follows no camera. */
export function cameraViewFor<T extends CameraElement>(element: Pick<CameraElement, "props">, elements: readonly T[], timelineSeconds: number, width: number, height: number): CameraView | null {
  const camera = cameraFor(element, elements);
  return camera ? cameraViewAt(camera, timelineSeconds, width, height) : null;
}

/** Where canvas point (x, y) lands through the view: the focus point moves to the centre, scaled by the zoom. */
export function cameraPoint(view: CameraView, x: number, y: number, width: number, height: number): [number, number] {
  const a = -view.rotationDeg * Math.PI / 180, dx = x - view.focusX, dy = y - view.focusY;
  return [width / 2 + view.zoom * (dx * Math.cos(a) - dy * Math.sin(a)), height / 2 + view.zoom * (dx * Math.sin(a) + dy * Math.cos(a))];
}

/** Row-major 2D affine `[a, b, tx, c, d, ty, 0, 0, 1]`: x' = a·x + b·y + tx, y' = c·x + d·y + ty. */
export type Affine = readonly [number, number, number, number, number, number, number, number, number];

/** The view as an affine map of canvas pixels, the same map `cameraPoint` applies. */
export function cameraMatrix(view: CameraView, width: number, height: number): Affine {
  const a = -view.rotationDeg * Math.PI / 180, m00 = view.zoom * Math.cos(a), m01 = -view.zoom * Math.sin(a), m10 = -m01, m11 = m00;
  return [m00, m01, width / 2 - (m00 * view.focusX + m01 * view.focusY), m10, m11, height / 2 - (m10 * view.focusX + m11 * view.focusY), 0, 0, 1];
}

/** `outer ∘ inner`: apply `inner` first. */
export function composeAffine(outer: Affine, inner: Affine): Affine {
  const [a, b, c, d, e, f] = outer, [g, h, i, j, k, l] = inner;
  return [a * g + b * j, a * h + b * k, a * i + b * l + c, d * g + e * j, d * h + e * k, d * i + e * l + f, 0, 0, 1];
}

/** CSS `matrix()` for an affine, used with `transform-origin: 0 0`. */
export function affineCss([a, b, tx, c, d, ty]: Affine) {
  return `matrix(${a}, ${c}, ${b}, ${d}, ${tx}, ${ty})`;
}

type Rect = { x: number; y: number; width: number; height: number };

/** The axis-aligned box a canvas rectangle covers once seen through the view. */
export function cameraRect(view: CameraView, rect: Rect, width: number, height: number): Rect {
  const corners = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]
    .map(([x, y]) => cameraPoint(view, x!, y!, width, height));
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/** A rectangle an element covers at `timelineSeconds`, moved through the camera it follows (unchanged if none). */
export function followerRect<T extends CameraElement>(element: Pick<CameraElement, "props">, elements: readonly T[], rect: Rect, timelineSeconds: number, width: number, height: number): Rect {
  const view = cameraViewFor(element, elements, timelineSeconds, width, height);
  return view ? cameraRect(view, rect, width, height) : rect;
}

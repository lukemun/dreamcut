const mediaName = /[^\s/\\<>"'[\]]+\.(?:mov|mp4|m4v|mkv|webm|avi|mxf|mts|m2ts|3gp|hevc|braw|r3d|wav|mp3|m4a|aac|flac|aiff?|ogg|opus|caf|png|jpe?g|heic|heif|webp|gif|tiff?|psd|exr|dng|cr[23]|arw|nef|srt|vtt|ass)\b/gi;

/** Last-mile scrubbing for errors, logs and spans. Never attach project state. */
export function scrubText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s<>"']+/gi, "[url]")
    .replace(/(?:file:\/\/)?(?:\b[A-Za-z]:[\\/]|\\\\|~[\\/]|\/(?:Users|home|private|var|tmp|Volumes|mnt|root|opt)\/)[^\s<>"']+/g, "[local-path]")
    // Media names survive outside a path (or after a space inside one): "My Wedding.mov".
    .replace(mediaName, "[media-file]")
    .replace(/\/api\/(?:projects|trailers)\/[^/\s?]+/g, "/api/projects/[project]")
    .replace(/\/p\/[^/\s?]+/g, "/p/[project]")
    .replace(/\/media\/[^\s?]+/g, "/media/[asset]")
    .replace(/\?[^\s]+/g, "?[filtered]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:Bearer\s+\S+|(?:sk|sk-ant|sntrys)_[\w-]+|sk-[\w-]+|gh[pousr]_[\w]+)\b/gi, "[credential]")
    .replace(/\b(?:token|password|secret|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, "[credential]")
    .replace(/(["'`])[^\n]*?\1/g, "[quoted-value]")
    .slice(0, 2000);
}

const privateKey = /(?:authorization|cookie|password|secret|token|api.?key|transcript|prompt|completion|source_url|media|filename|file_path|project.?id|trailer.?id|element.?id|user|body|payload|attachment|argv|command|locals|vars|context_line|pre_context|post_context)/i;

export function scrubTelemetry<T>(value: T): T {
  const visit = (input: unknown, depth: number): unknown => {
    if (depth > 12) return "[depth-limit]";
    if (typeof input === "string") return scrubText(input);
    if (input == null || typeof input === "number" || typeof input === "boolean") return input;
    if (Array.isArray(input)) return input.slice(0, 200).map((item) => visit(item, depth + 1));
    if (typeof input !== "object") return undefined;
    return Object.fromEntries(Object.entries(input).filter(([key]) => !privateKey.test(key))
      .map(([key, item]) => [key, visit(item, depth + 1)]));
  };
  return visit(value, 0) as T;
}

/** Where a stack frame's code lives, relative to the app: enough for source maps and
 * grouping, without the origin, home folder or checkout location. Anything else is a
 * private path (a page URL can name a project). */
export function appCodeLocation(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (/^(?:<anonymous>|\[native code\]|native|node:[\w/.-]+)$/.test(value)) return value;
  const served = value.match(/^(?:blob:)?(?:https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?|app:\/\/)(\/[^?#\s]*)/i);
  if (served) return value.startsWith("app://") || served[1].startsWith("/_next/") ? `app://${served[1]}` : "app:///[page]";
  const code = value.replace(/^file:\/\//, "").match(/^(?:.*?[\\/])?((?:\.next(?:-[\w-]+)?|node_modules|src)[\\/].*)$/);
  return code ? `app:///${code[1].replace(/\\/g, "/")}` : "[local-path]";
}

type Frame = { filename?: unknown; abs_path?: unknown };
type Stack = { frames?: Frame[] };
type Debug = { images?: Array<{ code_file?: unknown }> };

export function scrubEvent<T extends { request?: unknown; extra?: unknown; breadcrumbs?: unknown; contexts?: unknown; server_name?: unknown }>(event: T): T {
  // Request and arbitrary application context can contain entire timelines or source text.
  const result = { ...event };
  delete result.request;
  delete result.extra;
  delete result.breadcrumbs;
  // Node reports the machine's host name, which often carries the owner's name.
  delete result.server_name;
  if (result.contexts && typeof result.contexts === "object") {
    result.contexts = Object.fromEntries(Object.entries(result.contexts).filter(([key]) => ["trace", "runtime", "browser", "os", "gpu"].includes(key)));
  }
  const stacks = (input: unknown): Stack[] => {
    const values = (input as { exception?: { values?: Array<{ stacktrace?: Stack }> }; threads?: { values?: Array<{ stacktrace?: Stack }> } });
    return [...(values.exception?.values ?? []), ...(values.threads?.values ?? [])].map(value => value.stacktrace ?? {});
  };
  // Generic scrubbing drops file names and turns code URLs into "[url]"; keep the
  // app-relative location instead so stacks stay readable and source-mappable.
  const locations = stacks(result).map(stack => (stack.frames ?? []).map(frame => ({
    filename: appCodeLocation(frame.filename), abs_path: appCodeLocation(frame.abs_path),
  })));
  const images = ((result as { debug_meta?: Debug }).debug_meta?.images ?? []).map(image => appCodeLocation(image.code_file));
  const scrubbed = scrubTelemetry(result);
  stacks(scrubbed).forEach((stack, index) => (stack.frames ?? []).forEach((frame, at) => {
    const location = locations[index]?.[at];
    if (location?.filename) frame.filename = location.filename;
    if (location?.abs_path) frame.abs_path = location.abs_path;
  }));
  ((scrubbed as { debug_meta?: Debug }).debug_meta?.images ?? []).forEach((image, index) => { if (images[index]) image.code_file = images[index]; });
  return scrubbed;
}

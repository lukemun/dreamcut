# Desktop media application practices — sourced findings

Scope: published guidance for Electron, Next.js deployment, browser media workers,
FFmpeg distribution and Sentry instrumentation. Retrieved 2026-10-08.

## Method and evidence boundary

Official project documentation and MDN API references were read directly through
web retrieval and HTTP text retrieval. The source records retain URLs, retrieval
date and short verified excerpts; they are not full-page captures. See
[raw source records](raw/desktop-media-stack/sources.json).
This document records source statements. Application decisions belong in the
[desktop migration plan](../architecture/desktop-app-plan.md).

This is a documentation review, not a performance benchmark, a security audit or a
license determination for a particular binary. Version-dependent behavior must be
verified against the installed SDK and packaged runtime. No unavailable source is
claimed absent; the Sentry pages were retrieved as Markdown after the web reader
rejected that content type.

## Electron process and security boundaries

Electron recommends keeping the framework and dependencies current, disabling Node
integration for remote content, enabling context isolation and sandboxing, retaining
web security, restricting navigation/window creation, using a restrictive CSP and
validating IPC senders. Its checklist specifically says to “Validate the sender of
all IPC messages.” [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

Electron's performance guide advises avoiding blocking the main process and the
renderer, using asynchronous APIs and moving long-running CPU work into workers.
It recommends measuring performance rather than assuming an optimization helps.
[Electron performance](https://www.electronjs.org/docs/latest/tutorial/performance).

`utilityProcess.fork` starts a Node-capable child with message ports. It is callable
after application readiness; its options include the working directory, environment,
stdio and service name. Exit events expose termination status.
[Utility process API](https://www.electronjs.org/docs/latest/api/utility-process).

Electron's native-module documentation explains that Electron has a different ABI
from a regular Node binary and native modules may need rebuilding for Electron.
[Native Node modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules).

## Next.js deployment and bundling

Next.js documents a custom server for requirements its integrated router cannot
meet. It states that standalone mode does not trace custom server files and that the
standalone server and custom-server approaches cannot be used together.
[Custom servers](https://nextjs.org/docs/app/guides/custom-server).

Output file tracing analyzes imports, requires and filesystem usage. Next.js exposes
trace inclusion/exclusion settings for missed or excess resources. Standalone output
does not copy `public` or `.next/static` by default; these assets require separate
handling. [Output tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).

## Media processing and resource ownership

`OffscreenCanvas` decouples canvas rendering from the DOM, supports worker contexts
and is transferable. The API exposes context-loss and restoration events.
[OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas).

`AudioWorklet` runs custom audio processing on a separate Web Audio thread, shared
with other audio nodes, for low-latency processing. It is a secure-context API.
[AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet).

WebCodecs provides low-level access to video frames and audio chunks, including
encoding and decoding. Its API includes asynchronous processing and interfaces
available in dedicated workers.
[WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API).

`VideoDecoder.isConfigSupported()` checks a specific decoder configuration, returning
support information rather than proving all configurations work.
[Decoder configuration support](https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder/isConfigSupported_static).
Calling `VideoFrame.close()` releases its reference to the media resource.
[Frame cleanup](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame/close).

CanvasKit is Skia compiled to WebAssembly. Its documented features include a WebGL
context exposed as a SkSurface and canvas, paint, path and text APIs.
[Skia CanvasKit](https://skia.org/docs/user/modules/canvaskit/).

Mediabunny distinguishes container support from codec availability. Its documentation
states that WebCodecs-backed codec availability depends on the browser and cannot be
guaranteed by the library; it exposes capability checks and custom coder support.
[Mediabunny formats and codecs](https://mediabunny.dev/guide/supported-formats-and-codecs).

## Distribution and updates

Electron documents signing and notarization as distinct macOS distribution steps;
its tooling supports automating these processes.
[Code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).
Electron's update guide describes `autoUpdater`, platform-specific release metadata
and static object-storage hosting for update artifacts.
[Application updates](https://www.electronjs.org/docs/latest/tutorial/updates).

FFmpeg's project states that its base license is LGPL 2.1 or later and that enabling
optional GPL components changes the license applicable to FFmpeg. Its distribution
guidance calls for corresponding source and build configuration information.
[FFmpeg license and legal considerations](https://ffmpeg.org/legal.html).

## Sentry across application processes

Sentry's Electron guide instructs initialization in the main process, renderer
processes and utility processes. Renderer events travel through the main process,
so renderer DSN, release and environment settings do not determine those values.
It also describes separate preload initialization when context isolation prevents
automatic capture there, and framework-specific renderer SDK composition.
[Sentry Electron setup](https://docs.sentry.io/platforms/javascript/guides/electron/).

Sentry's options reference exposes `dataCollection` controls for identity, cookies,
headers, bodies, query parameters, generative-AI content and stack context. The
Electron main process's `userInfo` setting controls IP inference across processes;
other collection categories apply where configured. Default behavior is
version-dependent. [Sentry Electron options](https://docs.sentry.io/platforms/javascript/guides/electron/configuration/options/).

## Reproduction and limits

Revisit the linked sections and compare them with the dated source records. Excerpts
are deliberately short; missing excerpt matches in a record concern that selected
phrase, not the existence of the capability. These findings do not certify an SDK
combination, prove end-to-end telemetry delivery, establish media performance, or
qualify a signed application. Those require implementation-specific evidence.

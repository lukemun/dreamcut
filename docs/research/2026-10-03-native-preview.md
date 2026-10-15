# Native and browser frame pipelines — sourced findings

Method: targeted primary-document review on 2026-10-03, covering graphics, decoding,
clocking and frontend integration. [Source records](raw/native-preview/sources.md).
No comparable application benchmark or implementation was run; sources describe APIs,
not achieved latency. WebCodecs is a Working Draft and support must be tested on the
chosen runtime. [Specification](https://www.w3.org/TR/2026/WD-webcodecs-20260921/).

| Area | Documented capability or constraint |
| --- | --- |
| Rust graphics | wgpu provides a Rust graphics API with native Metal, Vulkan, DirectX 12 and OpenGL backends, plus browser backends. [wgpu](https://docs.rs/wgpu/latest/wgpu/) |
| Media synchronization | GStreamer uses clocks, buffer timestamps and segments to synchronize pipeline playback. [Clocks](https://gstreamer.freedesktop.org/documentation/application-development/advanced/clocks.html) |
| Seeking | GStreamer distinguishes key-unit and accurate seeking; accurate positioning can require decoding from an earlier location. [Seeking](https://gstreamer.freedesktop.org/documentation/additional/design/seeking.html) |
| Rust media integration | GStreamer publishes Rust bindings; its Apple hardware decoder documents raw/GLMemory output. [Bindings](https://gstreamer.freedesktop.org/documentation/rust/git/docs/gstreamer/index.html), [decoder](https://gstreamer.freedesktop.org/documentation/applemedia/vtdec_hw.html) |
| Apple composition | AVVideoCompositing defines custom video composition; Core Video exposes a Metal texture cache for pixel buffers. [Composition](https://developer.apple.com/documentation/avfoundation/avvideocompositing), [texture cache](https://developer.apple.com/documentation/CoreVideo/cvmetaltexturecache-q3j) |
| Desktop web UI | Tauri uses platform webviews, including WKWebView on macOS. Rust commands and channels connect frontend/backend; documentation flags large serialized responses and provides binary responses. [Process model](https://v2.tauri.app/concept/process-model/), [calling Rust](https://v2.tauri.app/develop/calling-rust/) |
| Packaging | Tauri external binaries use target-specific executable names. [Sidecars](https://v2.tauri.app/develop/sidecar/) |
| Browser frame control | WebCodecs exposes timestamped encoded chunks and decoded frames, with worker-oriented usage guidance. Codec availability is implementation-dependent and hardware acceleration preferences are hints. [Specification](https://www.w3.org/TR/2026/WD-webcodecs-20260921/) |
| Browser presentation | Chrome's example queues decoded frames separately from timestamp-based canvas presentation and releases frames with close(). [Guide](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs) |
| Distribution | FFmpeg's baseline LGPL terms can change when optional GPL components are enabled. Actual binary configuration matters. [FFmpeg licensing](https://ffmpeg.org/legal.html) |

These documents do not establish performance for a particular editor, automatic equivalence
between native and browser text/effects, or compatibility of arbitrary decoder buffers
with a selected GPU API. Those questions require an implementation and measured trials.

# Native preview source records

Retrieved 2026-10-03. Targeted official documentation review, not full-page captures.
Excerpts below are short verbatim source records; other entries record reviewed scope.
No application performance was benchmarked in this research.

- [wgpu crate documentation](https://docs.rs/wgpu/latest/wgpu/), overview: “a cross-platform, safe, pure-Rust graphics API.” Scope: native backends and GPU API role.
- [WebCodecs specification](https://www.w3.org/TR/2026/WD-webcodecs-20260921/), hardware acceleration: “are hints.” Scope: codec support, acceleration hints, worker recommendations; Working Draft.
- [Chrome WebCodecs guide](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs), decoding: “Waiting for the right time to show the frame.” Scope: timestamped decode queues and canvas presentation.
- [GStreamer clocks](https://gstreamer.freedesktop.org/documentation/application-development/advanced/clocks.html), synchronization: reviewed pipeline clocks and timestamp scheduling.
- [GStreamer seeking](https://gstreamer.freedesktop.org/documentation/additional/design/seeking.html): reviewed accurate versus key-unit seek behavior.
- [GStreamer Rust bindings](https://gstreamer.freedesktop.org/documentation/rust/git/docs/gstreamer/index.html): reviewed binding role and licensing.
- [GStreamer Apple hardware decoder](https://gstreamer.freedesktop.org/documentation/applemedia/vtdec_hw.html): reviewed raw and GLMemory output formats.
- [Tauri process model](https://v2.tauri.app/concept/process-model/): reviewed system webview choice.
- [Tauri calling Rust](https://v2.tauri.app/develop/calling-rust/): reviewed commands, large response serialization and binary channels.
- [Tauri sidecars](https://v2.tauri.app/develop/sidecar/): reviewed per-target binary packaging.
- [Apple AVVideoCompositing](https://developer.apple.com/documentation/avfoundation/avvideocompositing): reviewed custom composition role; no local implementation trial.
- [Apple CVMetalTextureCache](https://developer.apple.com/documentation/CoreVideo/cvmetaltexturecache-q3j): reviewed GPU-backed pixel-buffer texture access.
- [FFmpeg licensing](https://ffmpeg.org/legal.html): reviewed LGPL baseline and optional GPL components. Not a legal assessment of a particular binary.

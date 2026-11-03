# Rendering library options — sourced findings

Method: targeted primary-document review on 2026-10-07 (local date), covering browser
renderers, Rust bindings and media composition engines. No comparative library
benchmark has yet been run. [Short source excerpts](raw/rendering-library-options/sources.md).
Application decisions and proposed trials belong in the separate
[library evaluation plan](../architecture/rendering-library-evaluation.md).

| Library | Documented capabilities and limits |
| --- | --- |
| CanvasKit | Skia compiled to WebAssembly exposes canvas, paint, path and text APIs, drawing to an HTML canvas through hardware-accelerated WebGL. [Official overview](https://docs.skia.org/docs/user/modules/canvaskit/) |
| PixiJS | Provides sequential filters, including Gaussian blur, color matrices and displacement; custom filters can include programs for WebGL and WebGPU. [Filters](https://pixijs.com/8.x/guides/components/filters) |
| PixiJS backends | Documents both WebGL and WebGPU renderers, shared render/resize/clear methods and texture-management systems. The examined documentation recommends WebGL for production and marks WebGPU experimental because browser inconsistencies can affect behavior. [Renderers](https://pixijs.com/8.x/guides/components/renderers) |
| rust-skia | Provides Rust bindings for Skia. The skia-safe crate manifest declares optional GL, Vulkan, Metal and D3D features. [Repository](https://github.com/rust-skia/rust-skia), [manifest](https://raw.githubusercontent.com/rust-skia/rust-skia/master/skia-safe/Cargo.toml) |
| GStreamer Editing Services | Selects compositors and supporting video elements from installed plugins. Its documented default uses the software compositor; hardware selection requires ranking a hardware compositor above it. Memory fallback can introduce uploads/downloads. [Hardware rendering](https://gstreamer.freedesktop.org/documentation/gst-editing-services/hardware-acceleration.html) |
| MLT | Provides multitrack audio/video composition and a plugin API. Its current release page describes a libplacebo GPU module for scaling, debanding, dithering, tone mapping and custom shaders. [Official project](https://www.mltframework.org/) |

## Scope and caveats

This is an initial documentation screen, not an adoption decision or exhaustive catalog.
Version pinning, licensing of the exact distributed dependency set, maintenance history,
platform builds and application compatibility have not yet been qualified. API descriptions
do not establish matching pixels, frame accuracy, latency or zero-copy integration.
Mutable documentation URLs were inspected on the date above; trials must record exact
package versions and hashes rather than treating these pages as reproducible binaries.

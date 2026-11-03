# Granular preview caching — sourced findings

Research date: 2026-10-05. Scope: temporal, processing-stage and spatial caching; live GPU composition; preview quality and scheduling. This document records external evidence. [The proposed DreamCut application](../architecture/granular-preview-cache-proposal.md) is separate.

## Live playback and selective preparation

Adobe states that Premiere attempts real-time playback of unrendered sequences, clips, effects, transitions and titles. Its Render and Replace operation can flatten selected clips and compositions for demanding sequences, with a Restore Unrendered operation. This is a documented workflow, not a guarantee that every sequence plays in real time. [Adobe: Render and replace](https://helpx.adobe.com/ca/premiere/desktop/render-and-export/render-sequences-for-playback/render-and-replace-media-in-a-sequence.html).

Premiere permits different playback and paused resolutions: its documentation gives lower-resolution playback and Full paused resolution as a way to combine smoother movement with detailed inspection. [Adobe: Display quality](https://helpx.adobe.com/premiere/desktop/get-started/source-and-program-monitor-adjustments/set-display-quality-for-the-source-and-program-monitors.html).

## Caching intermediate work

Blender's sequencer developer documentation describes raw, preprocessed, composite and final cache stages. Changes invalidate dependent stages; some intermediate stages are temporary, retained for same-frame adjustments rather than long-term storage. It describes RAM caching with a disk extension and explicitly discusses prefetch-aware eviction. These are documented implementation details, not an assertion that every stage is exposed in the current UI. [Blender: Cache](https://developer.blender.org/docs/features/sequencer/cache/).

Blender 5.0's user manual documents background caching of frames after the current frame, configurable memory limits, and raw/final cache controls. It notes that prefetch is unsupported for Scene strips. [Blender 5.0: Cache](https://docs.blender.org/manual/en/5.0/editors/video_sequencer/sequencer/sidebar/cache.html).

The Fusion 17 manual describes automatic RAM storage of processed frames, prioritization of viewer-displayed nodes, and possible caching of other nodes according to memory and processing cost (printed p.30). It also documents node-level Cache to Disk (p.97). These are version-specific historical facts, not a claim about the exact current Resolve implementation. [Blackmagic: Fusion 17 manual](https://documents.blackmagicdesign.com/UserManuals/Fusion17_Manual.pdf).

## Processing only the required image region

OpenFX distinguishes the area an effect can produce—Region of Definition—from the input areas needed to produce a requested output—Regions of Interest. A blur may require an input border equal to its radius. Tiling is not always beneficial: a small transformed output can require a large input. Support for tiles and differently positioned/resolution images is explicitly declared. [OpenFX: Image processing architectures](https://openfx.readthedocs.io/en/latest/Reference/ofxProcessingArch.html).

OpenFX describes recursively determining required regions, rendering and caching inputs, then rendering an effect within its clipped window. Its identity action allows an effect that does nothing to identify the input the host can use instead. [OpenFX: Rendering](https://openfx.readthedocs.io/en/main/Reference/ofxRendering.html).

Fusion 17 documents intersecting the viewer's selected region with the Domain of Definition to decide which pixels are rendered (viewer RoI controls, printed p.20). [Blackmagic: Fusion 17 manual](https://documents.blackmagicdesign.com/UserManuals/Fusion17_Manual.pdf).

## Browser decode and GPU composition building blocks

Google documents WebCodecs access to browser codecs and raw frames, worker-based frame processing, transferable VideoFrames, OffscreenCanvas, queue backpressure and explicit frame closure. [Chrome: Video processing with WebCodecs](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs).

Chrome's WebGPU documentation describes importing video and WebCodecs VideoFrames as external textures, potentially avoiding a copy from source YUV data. The wording is conditional: it does not promise zero-copy execution on every device or path. [Chrome: WebGPU 116, WebCodecs integration](https://developer.chrome.com/blog/new-in-webgpu-116).

The WebCodecs specification defines decoder queue size and hardware acceleration as a preference hint; it cautions about limited/shared hardware codec resources. API support alone does not establish actual hardware acceleration for a given configuration. [W3C: WebCodecs](https://www.w3.org/TR/webcodecs/).

## Method and limits

Primary documentation was searched and opened on the research date. The [source record](raw/granular-preview-cache/sources.md) records examined sections, short attributed excerpts, dates and retrieval methods. Blender pages were recovered through a fresh isolated Chrome context after the web fetcher failed. The official Fusion PDF was recovered directly and inspected with `pdftotext -layout`; the full PDF is not redistributed here.

No external product was benchmarked. No claim is made about proprietary CapCut internals, present-day Resolve source code, universal GPU availability, or an achieved DreamCut speedup from these prospective designs. Vendor documentation establishes mechanisms and supported workflows, not comparative latency.

# UI separation and media playback — sourced findings

| | |
| --- | --- |
| Date | 2026-09-29 |
| Method | Official HTML, browser API, Remotion and GStreamer documentation; original GUI-pattern article; targeted web searches followed by reading the pages |
| Scope | UI responsibility boundaries, loading, readiness, clock synchronization and buffering |
| Source records | [Attributed excerpts and retrieval method](raw/preview-playback-architecture/sources.md) |

## How to read this

This document records source findings. DreamCut decisions and implementation status
live in [the application architecture](../architecture/application-layering.md)
and [playback architecture](../architecture/playback-rendering.md).

## Presentation and domain

Fowler identifies separation of domain behavior from presentation as a central MVC
principle and describes multiple subsequent GUI architecture variants. His account
places domain calculations outside GUI objects. [GUI Architectures, MVC](https://martinfowler.com/eaaDev/uiArchs.html)

## Loading versus usable data

HTML's `preload` attribute is a hint that a user agent may ignore; changing it to
`auto` does not impose a guaranteed preload quantity. [HTML standard, preload](https://html.spec.whatwg.org/multipage/media.html#attr-media-preload)

`buffered` exposes a snapshot of the media ranges buffered at access time.
[MDN, buffered](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/buffered)

`HAVE_METADATA` permits seeking but does not establish playable data.
`HAVE_CURRENT_DATA` covers the current position; `HAVE_FUTURE_DATA` includes some
future data. [MDN, readyState](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/readyState)

## Buffering and intent

Remotion distinguishes user playback state from temporary buffering. Its delay
handles must be released on completion and unmount, including when a seek removes
the waiting component. Waiting/resume events expose that coordinated state.
[Remotion, buffer state](https://www.remotion.dev/docs/player/buffer-state)

Remotion premounts a sequence before its start to load content early. Premounted
media do not trigger the active player buffer state. Premounting is scoped to
interactive playback, not rendering. [Remotion, premounting](https://www.remotion.dev/docs/player/premounting)

GStreamer's non-live buffering example pauses a pipeline while buffering and resumes
only when the target state is playing. Its stream-buffering design uses low/high
watermarks and describes tuning by bandwidth or bitrate.
[GStreamer, buffering](https://gstreamer.freedesktop.org/documentation/application-development/advanced/buffering.html)

## Clock and time mapping

GStreamer synchronizes streams through a selected pipeline clock, buffer timestamps
and segment mapping. Pipeline running time excludes paused periods. Its documentation
distinguishes running time from stream position and describes preferring an audio
sink clock in a typical playback pipeline.
[GStreamer, clocks](https://gstreamer.freedesktop.org/documentation/application-development/advanced/clocks.html)

## Method and limits

Sources are browser specifications, library/framework documentation and a pattern
author's analysis. They establish their respective designs, not a universal video-editor
architecture or proof of any DreamCut implementation's performance. No proprietary
editor internals or comparative product benchmarks were examined. The retained Remotion
checkout is a separate local implementation reference; current online documentation
can describe newer versions. Browser decoding and hardware-specific behavior still
require runtime measurements. Research used no delegated agents.

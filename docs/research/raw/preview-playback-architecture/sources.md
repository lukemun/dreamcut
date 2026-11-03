# Preview playback architecture — source records

Retrieved 2026-09-29. Scope: **short attributed excerpts**, not full captures.
Publication dates are unknown unless noted. Claims below identify what each source
supports, not recommendations for DreamCut.

| ID | Publisher / title | URL and examined section | Excerpt | Supports |
| --- | --- | --- | --- | --- |
| P1 | Martin Fowler, GUI Architectures (18 July 2006) | https://martinfowler.com/eaaDev/uiArchs.html — MVC / Separated Presentation | “Make a strong separation between presentation (view & controller) and domain (model)” | Domain/presentation separation; variations in MVC |
| P2 | WHATWG, HTML Living Standard | https://html.spec.whatwg.org/multipage/media.html#attr-media-preload — preload | “The attribute may be ignored altogether” | Preload is advisory |
| P3 | MDN contributors, HTMLMediaElement.buffered | https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/buffered — Value | “A new static normalized TimeRanges object” | Observed buffered ranges |
| P4 | MDN contributors, HTMLMediaElement.readyState | https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/readyState — Value | “Data is available for the current playback position, but not enough to actually play more than one frame.” | Current-data versus future-data readiness |
| P5 | Remotion, The Player buffer state | https://www.remotion.dev/docs/player/buffer-state — Possible states / mechanism | “Whether a player is buffering does not internally change the playing / paused state.” | Playback intent versus buffering; releasable waits |
| P6 | Remotion, Premounting | https://www.remotion.dev/docs/player/premounting — premounted sequences | “Premounting only applies in the Player and Studio, not during rendering.” | Early mounting and preview scope |
| P7 | GStreamer, Buffering | https://gstreamer.freedesktop.org/documentation/application-development/advanced/buffering.html — stream buffering | “The buffer element has a low and high watermark expressed in bytes.” | Coordinated pipeline waits and watermarks |
| P8 | GStreamer, Clocks and synchronization | https://gstreamer.freedesktop.org/documentation/application-development/advanced/clocks.html — clock running-time | “Because all objects in the pipeline have the same clock and base-time” | One selected clock and timestamp mapping |

## Retrieval method

Queried official documentation and the pattern author's article. Read P1, P2,
P4–P6 using the web reader. MDN preload/buffered and GStreamer pages returned
reader errors; all four were successfully retrieved in a fresh headless Chromium
context using Playwright and `main.innerText`. No sources are declared inaccessible.
MDN preload was an additional cross-check of P2, not a separate finding.
No copied full articles are committed. Search results alone are not evidence.

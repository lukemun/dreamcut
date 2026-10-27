# Frame-accurate browser preview — sourced findings

Date: 2026-10-03. Method: targeted web search, then direct examination of five primary documentation pages. [Source excerpts](raw/frame-accurate-preview/sources.md). Application and repository-specific recommendations are separate.

1. Video-frame callbacks can arrive a display refresh late; their scheduling does not provide strict synchronization guarantees. [MDN, Description](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback).
2. HTML video seeking is not guaranteed frame-accurate. Google's documentation identifies WebCodecs as an API for frame-accurate applications. [Chrome, mediaTime discussion](https://web.dev/articles/requestvideoframecallback-rvfc).
3. WebCodecs decoding accepts timestamped encoded chunks. Its output can be queued, scheduled and drawn explicitly; applications must release frames when finished. [Chrome, Decoding](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs).
4. Remotion provides coordinated playback buffering and separately controls rendering readiness. Buffer handles must be cleared on completion or unmount. [Remotion, Player buffer state](https://www.remotion.dev/docs/player/buffer-state).
5. Premiere supports rendering a selected sequence section for playback and distinguishes rendered from unrendered sections using timeline indicators. [Adobe, Render sequence sections](https://helpx.adobe.com/premiere/desktop/render-and-export/render-sequences-for-playback/render-a-section-of-a-sequence.html).

## Limits

Documentation establishes API behavior and available approaches, not the cause of any individual application's bug. It does not prove codec support, alpha parity, uninterrupted frame delivery on all hardware, or a particular export's correctness. No competing editor was benchmarked. No claim of guaranteed wall-clock playback follows from owning decoded frames.

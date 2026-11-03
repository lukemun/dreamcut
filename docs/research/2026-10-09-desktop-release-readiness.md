# Desktop release readiness — primary-source findings

Date: 2026-10-09. Method: direct reading of official Electron, Sentry, W3C and FFmpeg documentation. [Source records and examined sections](raw/desktop-release-readiness/sources.md). Product decisions live in the separate [release application plan](../architecture/desktop-release-readiness.md).

## Security and responsiveness

Electron recommends maintained framework/dependencies, context isolation, sandboxing, permission handling, restricted navigation/new windows, sender validation for IPC, CSP and evaluation of fuses. [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

Electron advises avoiding long-running work on the main/UI thread and preferring asynchronous operations when available. [Electron performance guidance](https://www.electronjs.org/docs/latest/tutorial/performance).

## Distribution and updates

Electron documents macOS distribution as signing followed by Apple notarization, with developer enrollment, Xcode and signing certificates as prerequisites. [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).

Electron documents static-storage update metadata and platform-specific update protocols. Its macOS server specification describes a ZIP URL for available updates and an HTTP 204 response when no update is available. [Electron updates](https://www.electronjs.org/docs/latest/tutorial/updates).

Electron provides end-to-end testing guidance using external tools, including WebdriverIO and Selenium; it does not maintain its own testing solution. [Electron automated testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing).

## Diagnostics and privacy controls

Sentry documents version-dependent Electron dataCollection behavior. beforeSend can transform or discard error events; the main-process hook applies to events captured across processes, while a renderer hook applies only to that renderer. [Sentry options](https://docs.sentry.io/platforms/javascript/guides/electron/configuration/options.md).

Sentry's source-map guide documents production-build generation/upload and Debug IDs for linking maps to emitted code. [Sentry source maps](https://docs.sentry.io/platforms/javascript/guides/electron/sourcemaps.md).

## Media controls and distribution inputs

W3C's media-player guidance calls for keyboard operation, visible focus, clear labels and sufficient contrast, including use with zoom and assistive technology. [W3C WAI Media Players](https://www.w3.org/WAI/media/av/player/).

FFmpeg documents LGPL licensing with optional GPL components that change the applicable FFmpeg license, and provides a distribution checklist tied to build configuration. [FFmpeg legal considerations](https://ffmpeg.org/legal.html).

## Limits

This is a documentation review, not an audit of a released binary, a legal determination, a performance benchmark or a compliance certification. Official pages are living documentation; source-map and data-collection behavior must be checked against the pinned SDK. Sentry HTML retrieval errors were recovered through official Markdown URLs. No source publication date was inferred from a crawl date.

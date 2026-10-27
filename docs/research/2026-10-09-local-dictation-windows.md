# Local speech input and Windows desktop distribution — sourced findings

Date: 2026-10-09. Method: inspect primary documentation, upstream release/model metadata and license texts; retain scoped [source records](raw/local-dictation-windows/sources.md). Product choices and repository qualification belong in the separate [application plan](../architecture/local-dictation-windows.md).

## Model footprint and deployment

| Whisper model family | Published disk size | Published memory estimate |
|---|---:|---:|
| tiny | 75 MiB | ~273 MB |
| base | 142 MiB | ~388 MB |
| small | 466 MiB | ~852 MB |

These are upstream estimates, not measurements of an Electron application. [whisper.cpp memory table](https://github.com/ggml-org/whisper.cpp#memory-usage).

The pinned ggml-base.en.bin artifact is 147,964,211 bytes. Its LFS SHA-256 is a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002. [Pinned model metadata](https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1).

whisper.cpp documents CPU-only inference and Mac, Windows and WebAssembly support. Its command-line example accepts 16-bit WAV; model quantization is separately supported. [Upstream README](https://github.com/ggml-org/whisper.cpp).

The engine and OpenAI Whisper carry MIT license texts, including preservation of copyright and permission notices. [Engine license](https://github.com/ggml-org/whisper.cpp/blob/v1.9.5/LICENSE), [Whisper license](https://github.com/openai/whisper/blob/v20250625/LICENSE).

## Microphones, native recognition and boundaries

Electron exposes macOS microphone permission requests through askForMediaAccess, and documents the usage-description requirement in Info.plist. Denied permission may require changing system preferences and restarting the app. [Electron systemPreferences](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesaskformediaaccessmediatype-macos).

Electron session APIs expose permission request and check handlers, including requesting-origin and media information. Its security checklist recommends context isolation, sandboxing, restricted navigation and sender validation for IPC. [Session API](https://www.electronjs.org/docs/latest/api/session), [security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

The Web Speech on-device explainer defines processLocally and availability/installation APIs. The explainer does not constitute a compatibility result for a particular embedded Chromium build. [Web Speech explainer](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md).

Windows provides a SpeechRecognizer API with recognition constraints and a microphone capability requirement. [Microsoft API reference](https://learn.microsoft.com/en-us/uwp/api/windows.media.speechrecognition.speechrecognizer).

## Packaging, updates and process ownership

Electron distribution packages application code/resources with the runtime; signing is a separate distribution step. [Distribution overview](https://www.electronjs.org/docs/latest/tutorial/distribution-overview).

Forge's Squirrel.Windows maker produces Setup.exe plus update artifacts; Windows signing has its own certificate/provider configuration. [Windows maker](https://www.electronforge.io/config/makers/squirrel.windows), [Windows signing](https://www.electronforge.io/guides/code-signing/code-signing-windows).

GitHub Actions matrices can vary operating systems and other job parameters, with fail-fast controlling cancellation of other matrix jobs after a failure. [Matrix documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations).

Windows Job Objects can group processes and enforce termination when the last job handle closes using JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE. [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

FFmpeg's license depends on enabled components; enabling GPL components changes the applicable license. The project's distribution guidance includes source, notices and build configuration considerations. [FFmpeg license/distribution guidance](https://ffmpeg.org/legal.html).

## Limits

The model sizes above are published estimates or pinned artifact metadata, not latency/accuracy benchmarks. Hardware-specific performance, microphone UX and packaged behavior require separate measurements. No claim is made that a Windows installer or Apple-native recognition integration has been qualified. Source retrieval scope and substituted official references are recorded in the raw source record.

# Source excerpts — local dictation and Windows packaging

Retrieved 2026-10-09 through official web documentation, upstream repositories and metadata APIs. These are short attributed excerpts, not full captures.

| Publisher / source | Section | Excerpt or capture scope |
|---|---|---|
| [ggml-org whisper.cpp](https://github.com/ggml-org/whisper.cpp#memory-usage) | Memory usage | “base \| 142 MiB \| ~388 MB”; “small \| 466 MiB \| ~852 MB” |
| [ggml-org model metadata](https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1) | ggml-base.en.bin | size 147964211 bytes; LFS SHA-256 a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002 |
| [whisper.cpp license](https://github.com/ggml-org/whisper.cpp/blob/v1.9.5/LICENSE) | License | “MIT License” |
| [OpenAI Whisper license](https://github.com/openai/whisper/blob/v20250625/LICENSE) | License | “MIT License” |
| [Electron systemPreferences](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesaskformediaaccessmediatype-macos) | askForMediaAccess | “A promise that resolves with true if consent was granted and false if it was denied.” |
| [Electron session](https://www.electronjs.org/docs/latest/api/session) | Permission check/request handlers | Handler arguments, requesting origin/frame and media type reviewed. |
| [Electron security](https://www.electronjs.org/docs/latest/tutorial/security) | Checklist | “Validate the sender of all IPC messages” |
| [Electron Forge](https://www.electronforge.io/config/makers/squirrel.windows) | Squirrel.Windows | “Setup.exe” (installer output); build prerequisites reviewed. |
| [Electron Forge signing](https://www.electronforge.io/guides/code-signing/code-signing-windows) | Windows code signing | Certificate and signing-provider setup reviewed. |
| [GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations) | Matrix jobs | OS matrix and fail-fast configuration reviewed. |
| [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) | Managing Job Objects | “closing the last job object handle terminates all associated processes” |
| [Microsoft SpeechRecognizer](https://learn.microsoft.com/en-us/uwp/api/windows.media.speechrecognition.speechrecognizer) | Remarks | Microphone capability requirement and constraint API reviewed. |
| [Web Speech on-device explainer](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md) | API | processLocally, availability and installation APIs reviewed. |
| [FFmpeg legal](https://ffmpeg.org/legal.html) | License | “FFmpeg is licensed under the GNU Lesser General Public License (LGPL) version 2.1 or later.” |

API observations: whisper.cpp v1.9.5 resolves to d1be6fde11ac6e0407606b4e42fe72d34add8037; model repository revision 5359861c739e955e79d9a303bcbc70fb988958b1. BtbN release autobuild-2026-10-09-14-16 advertises ffmpeg-n9.0.2-24-gfd5d616c29-win64-gpl-shared-9.0.zip with SHA-256 25a4dd7be950697e87235289e62dc93148d276cb7527620a730a4cbb21dc8488. [Release metadata](https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/autobuild-2026-10-09-14-16).

The Electron permissions tutorial retrieval did not yield content; the successfully retrieved official systemPreferences and session reference pages supply the permission evidence instead. No absence finding is inferred. Apple native recognition documentation was not used as evidence; its initial fetch did not yield content. No claim of an exhaustive Apple API audit.

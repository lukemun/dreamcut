# What DreamCut's features need beyond the runtime download

For each: the features that need it, what installs it in an installed DreamCut (and in a source checkout),
what checks it, and how a missing or broken one fails. "Setup" is `node bin/dreamcut.mjs setup` (in the packaged runtime it runs in the background)
([scripts/setup-features.mjs](../../../../scripts/setup-features.mjs)); "doctor" is `pnpm setup:check` (`node bin/dreamcut.mjs doctor`).

| Dependency | Needed by | Installed by | Checked by | When missing |
| --- | --- | --- | --- | --- |
| FFmpeg, ffprobe | Nearly everything: import, preview preparation, audio treatments, stabilization (vid.stab), frame checks (drawtext), export | macOS: shipped in the runtime (`media-tools/`, [build-ffmpeg](../../../../packaging/build-ffmpeg.mjs)), first on PATH. Fallback: setup's conda-forge FFmpeg (no vid.stab). Checkout: the system's | doctor (required) | Raw FFmpeg errors in the job; stabilization names the missing vid.stab |
| Google Chrome | Export, frame checks | The creator | doctor (required), `setup:check` | Playwright launch error at export |
| whisper-cli (whisper.cpp) | Captions, `speech_prepare` transcribe, chunked alignment | Setup (conda-forge). Checkout: `brew install whisper-cpp` | doctor | "whisper-cli is not installed" naming doctor |
| Whisper models `ggml-small.bin`, `ggml-silero-v6.2.0.bin` (`~/.cache/whisper-models`, or `WHISPER_MODEL`, `WHISPER_VAD_MODEL`) | Same | Setup's speech step ([setup-speech](../../../../scripts/setup-speech.mjs), checksum-pinned). Checkout: `pnpm setup:speech` | doctor | `speech_prepare` names the missing model; scripts name `setup-speech` |
| Montreal Forced Aligner 3.x (`MFA_BIN`) | Word timing for captions and take joins | Setup (conda-forge, its own environment) | doctor | "MFA is not installed" naming doctor |
| MFA models `english_mfa`, `english_us_mfa`, `english_us_arpa` (`MFA_ROOT_DIR`, default `~/.local/share/mfa-data`) and the Hugging Face snapshot `MontrealCorpusTools/english_mfa` | Same; `speech_prepare` aligns offline (`HF_HUB_OFFLINE=1`) | Setup's speech step | doctor | The dictionary is named; a missing Hugging Face snapshot fails inside MFA |
| Python with NumPy (`DREAMCUT_PYTHON`) | Speech clean-up | Setup (conda-forge). Checkout: the system's `python3` | doctor | Raw Python error |
| DeepFilterNet (`~/Library/Caches/DreamCut/voice-enhancement-py311`, legacy OpenEdit/OpenSequence folders) and its model | "Enhance voice", `use_voice_enhancement` | Setup's voice step ([setup-voice](../../../../scripts/setup-voice.mjs), through uv). Checkout: `pnpm setup:voice` | doctor, `setup-voice --check` | Not installed, or "needs reinstalling" for a launcher whose folder was renamed; both name `pnpm setup:voice` |
| SAM 2.1 environment and checkpoint (`TIMELINE_MATTING_DIR`, app data in an installed DreamCut) | Cutouts, cutout templates, surface tracking (OpenCV) | Setup's tracing step or MCP `cutout_setup`, sharing one pid file ([setup-matting](../../../../scripts/setup-matting.mjs)) | doctor, `cutout_setup status` | `MATTING_NOT_INSTALLED` with the install route |
| micromamba 2.9.0-0 | Setup itself | Setup (checksum-pinned download) | Setup | Setup step fails and retries on a later start |
| librosa environment (`BEAT_PYTHON`, `.venv-music`) | Beat analysis, music analysis | Nothing; checkout only | None | Beat analysis names the variable; unavailable in an installed DreamCut |
| Demucs environment (`STEMS_PYTHON`, `.venv-stems`) | Instrument separation | Nothing; checkout only | None | Names `scripts/requirements-stems.txt`; unavailable in an installed DreamCut |
| Rust preview helper | Opt-in Rust playback (`DREAMCUT_NATIVE_PREVIEW=1`) | `pnpm setup:rust`; checkout only | `setup:rust --check` | Raw error when enabled without a build |

Platform notes: the shipped FFmpeg is built on macOS only so far; Windows uses the setup's conda-forge
FFmpeg (no stabilization). The setup's Windows paths (`Library\bin`, `Scripts`) are untested.

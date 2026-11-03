# Goal: DreamCut runs from inside Claude Code and Codex on macOS and Windows

Status: superseded 2026-10-27 (DreamCut installs from its public GitHub repository; the npm launcher and its
packaging were removed). Set 2026-10-11. Replaces the macOS-first desktop launch. Windows support is built from
research now and verified on real hardware later (decided 2026-10-11): no VM or cloud testing in this goal. Design:
[local web app, agent plugin and library contract](web-desktop-library-contract.md).

## Done means

A creator who has never seen DreamCut, on a clean macOS **and** a clean Windows 11 machine, can:

1. Install DreamCut into Claude Code (plugin) or Codex (plugin or `mcp add`) from the instructions on the
   DreamCut website, approving each step the agent proposes.
2. Ask the agent to open DreamCut. The editor opens in the agent app's built-in browser, served on
   `127.0.0.1`. The same URL also works in a separately opened Chrome, Edge, Firefox or Safari.
3. Choose or accept a visible **DreamCut Library** folder. Drop in footage; it is imported as managed copies
   into the Library, with no upload anywhere.
4. Ask the agent to storyboard and then edit: it transcribes, drafts the storyboard, stages proposals; the
   creator reviews and approves in the editor.
5. Export an MP4 on request.
6. Close everything, reopen, and find the same project. A future desktop app opening the same Library would
   see the same project, as proven by the contract fixture corpus.

On machines without the optional media runtime (no GPU, or Python tools not installed), the editor still
opens, imports, edits and exports. Features that need a missing runtime say what is missing and offer the
agent-led install. They don't fail silently.

## Measured acceptance

- **macOS clean-machine run (verified in this goal):** the done-means loop on Apple Silicon, in the Claude app
  and the Codex app, and with a terminal agent plus a separate browser.
- **Windows (implemented from research, verified later):** everything Windows-specific follows the plan below
  and the [Windows findings](../research/2026-10-11-windows-testing-and-media-runtime.md). Each such behaviour
  is covered by unit tests that do not need Windows (path handling, command construction, tier selection from
  recorded hardware facts). It is reported as **unverified on Windows** until a real Windows test.
- **Contract tests:** the Library fixture corpus covers every format version, unknown-field preservation,
  interrupted writes, stale revisions, and paths with spaces and non-ASCII characters.
- **Security:** the localhost server refuses requests with a foreign `Host` or `Origin`, and requests
  without the per-launch secret. A DNS-rebinding test and a cross-site request test are included.
- **Agent evals:** the existing feature evals pass under Codex and Claude after the packaging change.
- **Footage privacy:** a network capture during a full macOS editing session shows no media bytes leaving
  the machine except through the agent's own model requests.

## Milestones

| # | Milestone | Exit check | Status |
| --- | --- | --- | --- |
| 1 | Library contract and shared Library module; visible Library with migration from older project folders | Fixture corpus green; existing projects reopen identically after migration | Done 2026-10-11: [contract](../standards/library-contract.md), `src/lib/library/`, `library_status`/`library_setup` tools, 17 contract tests. Remaining conformance gaps are listed in the contract. |
| 2 | `dreamcut` package: extract `@dreamcut/library` from `src/lib/library/`, production editor build, MCP with `editor_open` and auto-start, localhost hardening | `npx dreamcut` on a clean Mac opens the editor; security tests green | Done 2026-10-11 except publishing: `dreamcut` launcher and darwin-arm64 runtime (279 MB archive) pass `packaging/verify-web-runtime.mjs` 15/15 from fresh app data; sign-in security tests green. `@dreamcut/library` is still `src/lib/library/` inside the runtime, not a separate package. **Owner steps:** choose a public download location for runtime archives, publish `dreamcut` to npm. |
| 2b | Self-updating runtime: base and app layers, update feed, in-place Update in the editor | Newer version published while the editor runs is installed without the base layer and applied with the browser still signed in | See [distribution](web-desktop-library-contract.md#distribution-decided-2026-10-11) |
| 3 | Claude Code and Codex plugins; install instructions page | Clean-Mac install from the instructions in both apps | Built 2026-10-11: one plugin in the `dreamcut` npm package for both apps, a marketplace builder, a first-run setup mode, and the dreamcut.io install page with `install.md` (branch `site-install`). Verified: plugin and marketplaces pass `claude plugin validate --strict`; in Claude Code, a session with no runtime reported download progress and gained the full tools when it finished; Codex installs the plugin and registers its server. **Published 2026-10-12:** `dreamcut` 0.1.2 on npm (FSL-1.1-ALv2), the runtime on Vercel Blob, the public `lukemun/dreamcut-plugins` marketplace (installs verified in both apps). The install page is deployed as a preview only; production waits on the dreamcut.io site's own release. Then the clean-Mac run in both apps. |
| 4 | Hardware detection and agent-led runtime install (`runtime_status` tool) | Tier selection tested from recorded hardware facts; macOS install verified | Not started |
| 5 | Windows runtime port: process trees, `.cmd` launching, paths, FFmpeg, whisper.cpp, Python workers | Unit tests for Windows paths, commands and tiers; real Windows run deferred | Not started |
| 6 | Launch readiness: docs, telemetry consent, update path | Done means passes on all clean-machine runs | Not started |

## Windows: built from research, tested later

No VM or cloud testing is part of this goal. When a real Windows test happens, the options researched were:
- Parallels with Windows 11 on Arm (the setup Microsoft authorizes on Apple Silicon; no CUDA or WSL2, and
  probably no WebGPU).
- A rented NVIDIA Windows VM (Azure `NV6ads_A10_v5`, about $0.73/hour).
- A real PC, the most representative option.

See the [Windows findings](../research/2026-10-11-windows-testing-and-media-runtime.md).

## Runtime set up by the agent from detected hardware

The creator's agent installs the media runtime, but DreamCut code decides what to install. A
`runtime_status` MCP tool returns the following facts:

- OS and **OS architecture** separately from the process architecture, because x64 processes under
  emulation report AMD64.
- GPU vendor and model, VRAM from `nvidia-smi` where present (`Win32_VideoController.AdapterRAM` is a
  32-bit field and unreliable), and CUDA driver availability.
- Free disk on the Library volume, and which tools are already present.

It maps these to a capability tier and an exact install plan. The agent runs each step with the
creator's approval and calls `runtime_status` again to confirm.

| Piece | Windows x64 + NVIDIA | Windows x64, no NVIDIA | Windows on Arm |
| --- | --- | --- | --- |
| Python | uv-managed Python (no admin, python-build-standalone) | same | same (uv Tier 2) |
| FFmpeg | Fetched by the creator's agent from gyan.dev or BtbN, so DreamCut never redistributes GPL binaries; LGPL BtbN is an option | same | BtbN `winarm64` |
| Transcription | whisper.cpp CUDA 12.4 build | whisper.cpp CPU/BLAS build | whisper.cpp `win-cpu-arm64` |
| Word alignment (MFA) | conda-forge win-64 | same | x64 under emulation; not yet tested |
| Cutouts (SAM2) | PyTorch CUDA; native Windows is unofficial (SAM2 recommends WSL) | CPU, marked slow | CPU, marked slow |
| Stems (Demucs) | PyTorch CUDA (unmaintained upstream) | CPU, slow | CPU, slow |

A missing or slow tier is shown in the editor as what is unavailable and why. The agent can offer to
install it, and nothing fails silently.

Longer term, ONNX Runtime under Windows ML (CUDA, DirectML and QNN providers) is the path to GPU and NPU
acceleration without CUDA. DirectML itself is in sustained engineering.

**Process handling on Windows:**
- End worker trees with `taskkill /T /F`; Windows has no POSIX process groups.
- Launch `.cmd` shims as `cmd.exe /c`, because Node rejects `.cmd` files without a shell, and `shell: true`
  with an argument array is deprecated.
- Never build Python paths as `venv/bin/python`; it is `Scripts\python.exe` on Windows.

**Node itself:** the Claude Code native installer and the Codex app do not require Node. So either
running DreamCut needs Node installed (WinGet `OpenJS.NodeJS.LTS`, set up by the agent), or DreamCut ships
as a self-contained executable. This is decided in milestone 2.

## Out of scope for this goal

- The desktop app, beyond keeping the Library contract compatible.
- A hosted MCP server.
- Cloud editing or storage.
- Linux, unless it comes for free from the Windows and macOS work.

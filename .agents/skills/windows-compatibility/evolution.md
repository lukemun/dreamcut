# windows-compatibility — evolution log

## Purpose
Show, before a push that could affect Windows, that a Windows user's source install (README, Install) installs,
connects an agent over MCP, starts and serves the editor, using a Windows VM on the maintainer's Mac driven over
SSH. Scope: installing the copied working copy, the MCP check, and an editor check that uses the editor in
Windows Chrome through to an export. It never publishes and does not cover cutouts, transcription, generation or
the native file picker; the Graphics card renderer is covered only as this VM draws it, in software. Good looks
like: every install step exits 0, both checks pass in full, failures are fixed in shared code, and the report
names what was not covered (x64 emulation on Arm, untested features). Until 2026-10-27 it built and checked the
npm launcher's Windows download instead.

## 2026-10-22 — first Windows run

- **Observation:** No Windows download had ever been published. The first VM run failed in eight places:
  `.cmd` shims, a Windows path used as a module URL, pnpm's linked layout lost when the runtime is copied
  without links, the isolated install escaping to the enclosing workspace, a Git-ignored file required by
  the build, POSIX mode checks, and the MCP server never exiting on disconnect (Windows agents then kill it).
- **Decision:** Keep the check identical across platforms, fix causes in packaging, launcher and server,
  and record the failure patterns in references/windows-pitfalls.md. Drive the VM over SSH so no agent
  app or sign-in is needed inside it.
- **Verification:** On Windows 11 on Arm (build 26300) with x64 Node 24.22.1, all build steps passed and
  `verify-web-runtime.mjs` passed 31/31; the face-detector test passed on Mac and Windows. The helper
  scripts were then run end to end on the same VM: `vm.sh` reported `x64`, `copy-to-vm.sh` copied the
  working copy, and `build-and-verify.ps1` passed every step with 31/31 checks (about 22 minutes). That
  run first caught the script passing a range of arguments as one (fixed by splatting with `@rest`).

## 2026-10-22 — editor check in Windows Chrome

- **Observation:** The owner asked for a check that a Mac-side change works for a Windows user end to
  end, and for the VM's setup to be explained. Using the editor by hand in the VM's Chrome found:
  imported videos refused on the timeline (stored paths used `\` and missed their preparation records);
  exports from the packaged editor failing at the sound mix (FFmpeg fetched media without the session
  cookie, 403; not Windows-specific); clips added from the Library showing a preparation notice until
  the page was reloaded; a silent video added as 5 s instead of 3 s (the Library entry had no length yet,
  and the client fell back to 5 s); and an export error naming a renderer ("Standard") the UI calls
  Browser. UTM did not pass the Mac's synthetic clicks to Windows apps, and a browser started over SSH
  had no desktop.
- **Decision:** Add `open-editor.sh` (installs the packed launcher, serves the runtime locally, starts
  DreamCut and Chrome on the desktop through a scheduled task, forwards Chrome's debugging port) and
  `editor-check.mjs` (drives that Chrome from the Mac with generated clips and inspects the MP4 in the
  VM). Record why each part of the setup exists in references/vm-design.md. Keep building in the VM;
  a Mac-built Windows download is the stated direction but needs Windows native modules first.
  Fixes went into shared code and are listed in references/windows-pitfalls.md.
- **Verification:** On the same VM (Windows 11 on Arm, x64 Node), the first editor-check run caught the
  stale-link race in `open-editor.sh` (the running editor held its log open) and, on a build without the
  last fixes, failed 3 of 8 (preview after adding, playback, 5 s length) while confirming the export with
  sound. After the fixes, one chained run passed every build step, the install check 31/31, and the
  editor check 8/8: prepared clips played at 2.5 s, and the Browser-renderer export was 1080x1920 with
  sound at 4.00 s. Mac side: `pnpm typecheck`, the audio-export, timeline-shelf-placement, AssetShelf,
  GPU-admission and timeline-data tests, and the skill catalog tests pass.

## 2026-10-24 — no-graphics-card run
- **Evidence:** The editor check could not find New project (the dashboard now opens on the chat box)
  and selected the Browser renderer through a native `<select>` that no longer exists. Copying the
  working copy failed on files deleted but not yet committed. In the VM's Chrome (no WebGPU; WebGL2
  through Microsoft's basic display driver), clips placed before their proxy finished left the preview
  on Browser and export blocked until a reload.
- **Decision:** `copy-to-vm.sh` skips deleted files and removes them from the VM's copy. The editor
  check opens Projects for New project and now fails if Preview settings report export blocked or the
  Graphics card preview unavailable, since a machine without a graphics card needs no manual step.
- **Verification:** Install check 30/31; the failure (template search for Word Search Trace) also
  happens on the Mac, from an uncommitted gallery change. Editor check up to playback passed (6 checks).
  With the Mac dev server tunnelled into the VM, the Graphics card preview drew in software at half size
  (the new software default): 124 frames in 5 s, 20 ms each, against 27 frames, 230 ms each, at full
  size. Later runs also caught a proxy-not-ready refusal being taken for a missing graphics card (fixed
  in GpuPlaybackComposition), a stale untracked file breaking the build (`copy-to-vm.sh` now replaces the
  VM's source except dependencies and build output), and a race in the partial-download check (now waits
  for cleanup). The check now selects the header Export by its title and Library adds by "Add … to
  timeline". Final run on a fresh build: every build step exited 0, install check 31/31, editor check 9/9
  (Graphics card renderer in software: 75 frames in 2.5 s; export 1080x1920 with sound, 4.00 s). Builds that
  must survive the Mac sleeping run as the VM scheduled task described in the session notes.

## 2026-10-25 — part of the releasing bundle

- **Observation:** The owner made releasing a bundle of skills; this is its Windows step. The same day the
  runtime gained a shipped FFmpeg (macOS only) and a background feature setup that `dreamcut mcp` starts.
- **Decision:** Linked from releasing as step 2. The install check sets `DREAMCUT_FEATURE_SETUP=0`, so the
  VM's 31 checks are unchanged; the macOS-only FFmpeg check adds a 32nd on the Mac. Windows still has no
  shipped FFmpeg (the setup's conda-forge one has no stabilization) and the setup's Windows paths are untested;
  the next Windows run should cover `dreamcut setup` and `dreamcut doctor` in the VM.
- **Verification:** Not rerun in the VM after these changes.


## 2026-10-27 — checks the source install

- **Observation:** The owner moved DreamCut to installs from its public GitHub repository and retired the npm
  launcher, the runtime download and `pnpm release` ("we're not doing the NPM anymore").
- **Decision:** The VM installs the copied checkout the way the README tells a Windows user (`pnpm install`,
  `pnpm bootstrap`), `vm/mcp-check.mjs` connects as an agent through `node bin/dreamcut.mjs mcp`, and the
  editor check runs against `node bin\dreamcut.mjs --no-open` with projects in the checkout. The runtime
  build, packed launcher, local download server and first-run check left the procedure.
- **Verification:** `vm/mcp-check.mjs` passed 3/3 on the Mac; the editor-check and PowerShell scripts parse.
  The new procedure has not run in the VM yet.

## 2026-10-28 — the README connects agents through the plugin

- **Change:** the outcome names the README's current Install section, which installs the DreamCut plugin
  before cloning; `claude mcp add` stays as the way to connect a checkout elsewhere. The VM checks are
  unchanged: they still connect through `node bin/dreamcut.mjs mcp`, which is what the plugin starts.
- **Verification:** wording only; not run in the VM.

# Why the Windows test VM is set up this way

Each choice below answers a problem met while building the check (2026-10-22). Change one only with
its reason in view, and record the change in the [evolution log](../evolution.md).

## The machine

| Choice | Why |
| --- | --- |
| UTM with Windows 11 on Arm, on the maintainer's Mac | No Windows PC is available. Apple Silicon virtualizes Arm Windows at near-native speed; an x64 Windows image would need full emulation and is too slow to build in. |
| x64 Node (`winget ... --architecture x64`) | Most Windows users have x64 PCs. Windows on Arm runs x64 programs under emulation, so x64 Node makes the build produce, and the check run, the `win32-x64` download users get. Arm Node would build `win32-arm64` instead, which is why step 1 checks `process.arch`. Emulation makes builds slow (about 20 minutes). |
| Unactivated Windows | Activation does not affect any tested behaviour; the watermark is harmless. |
| Developer Mode, long paths (`core.longpaths`, the registry switch) | pnpm's nested `node_modules` paths exceed 260 characters, and link creation needs Developer Mode or administrator rights. |
| `Set-ExecutionPolicy RemoteSigned` for the user | PowerShell's default refuses `npm.ps1`/`pnpm.ps1`. Agent apps start `npx` without PowerShell, so users of the agent path are unaffected; people typing in PowerShell still meet it. |
| FFmpeg and Chrome from winget | Export and media preparation use FFmpeg from PATH and the headless renderer uses Chrome, as on a user's machine. |
| No graphics driver beyond Microsoft's basic display driver | UTM offers no GPU to Windows on Arm, so WebGPU is unavailable and the editor previews with its Browser renderer. The editor check therefore exports with the Browser renderer; the Graphics card renderer is untested here. |

## Driving it from the Mac

| Choice | Why |
| --- | --- |
| OpenSSH with a dedicated key (`~/.ssh/dreamcut_vm`), its own known-hosts file | Every step runs from the Mac's terminal, so no agent app, account or sign-in is needed inside the VM, and the key grants nothing else. |
| `vm.sh` reloads PATH in each command | An SSH session keeps the PATH from when sshd started; tools installed later by winget would otherwise be missing. |
| Copying the working copy (`copy-to-vm.sh`), not cloning | The check must cover uncommitted changes. Ignored files and `projects/` stay behind, so private media never enters the VM. |
| Building inside the VM | The download carries `node_modules` with native modules (`better-sqlite3`, `sharp`) compiled for one platform and Node version. The build installs and stages them on the platform it targets, so it runs where the download will run. See "Building on the Mac" in the [skill](../SKILL.md). |
| A local stand-in for GitHub Releases (`vm/serve-runtime.mjs`, `DREAMCUT_RUNTIME_BASE_URL`) | The launcher downloads exactly as from a release, including checksums, but from this checkout's build, so nothing is published to test. |

## Using the editor in the VM's browser

| Choice | Why |
| --- | --- |
| Starting the editor and Chrome through a scheduled task (`schtasks /it`) | SSH sessions run without a desktop. A browser started from SSH cannot render, and its pages never finish loading. An interactive task runs on the signed-in user's desktop, as a person's would. The VM must therefore be signed in to its desktop. |
| Chrome with `--remote-debugging-port=9222` and its own profile, forwarded to the Mac on port 9229 | UTM does not pass the Mac's synthetic clicks to the guest reliably, so screen control from the Mac cannot drive Windows apps. The DevTools protocol drives the real Windows Chrome instead, and the forwarded port keeps it reachable only through the SSH key. |
| `page.bringToFront()` before driving | Chrome gives a hidden or covered window no animation frames; the editor then never settles and every click waits until timeout. |
| `dreamcut --no-open` and the printed link | The editor accepts only browsers signed in by a single-use link. Starting without opening a browser leaves the link for the check to use once. The port changes on every start, so the check reads it from the link. |
| Generated test clips | The check needs a clip with sound (export must carry it) and one without, and must not depend on private or licensed media. |

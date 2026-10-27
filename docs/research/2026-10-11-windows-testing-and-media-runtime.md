# Windows testing environments and media runtime — sourced findings

| | |
| --- | --- |
| Date | 2026-10-11 |
| Method | Official Microsoft, Parallels, Broadcom, UTM, NVIDIA, Azure, AWS, GitHub, PyTorch, ONNX Runtime, Node.js, FFmpeg, Astral and project documentation, plus GitHub/PyPI/conda-forge/pricing APIs queried on the date above |
| Scope | (1) Testing Windows from an Apple Silicon Mac; (2) installing DreamCut's media stack on Windows x64 and ARM64; (3) detecting hardware; (4) process management in Node on Windows |
| Source records | No raw captures retained; each finding links its source and section |

## How to read this

Findings only. DreamCut decisions live in the [launch goal](../architecture/local-web-launch-goal.md) and
[library contract](../architecture/web-desktop-library-contract.md).

## 1. Testing Windows from an Apple Silicon Mac

- Microsoft: "Parallels® Desktop versions 18, 19, and 20 are authorized solutions for running Arm®
  versions of Windows 11 Pro"; "Experiences that depend on an additional layer of virtualization (nested
  virtualization) aren't supported", listing WSL, Windows Sandbox and VBS; DirectX 12 is listed as a
  limitation. [Microsoft support: Windows 11 on Apple M-series Macs](https://support.microsoft.com/en-us/windows/options-for-using-windows-11-with-mac-computers-with-apple-m1-m2-and-m3-chips-cd15fd62-9b34-4b78-b0bc-121baa3c568c)
- Parallels: "A unique Windows 11 Pro license is required for each Windows 11 Pro instance".
  [Parallels: Windows 11 on Apple M-series](https://www.parallels.com/windows-11-arm-apple-m-series/)
- Parallels graphics: "3D acceleration is currently supported at the level of DirectX 11.1 and OpenGL 4.3";
  "Nested Virtualization is not available". [Parallels KB 129497](https://kb.parallels.com/en/129497)
- VMware Fusion is "available free for Commercial, Educational, and Personal users" from 13.5.2.
  [Broadcom KB 368667](https://knowledge.broadcom.com/external/article/368667)
- UTM: "**arm64** is for Apple Silicon"; "you must have a valid license from Microsoft to run Windows";
  "Windows 11 24H2 has a compatibility issue with the graphics drivers that are provided by the UTM guest
  tools ISO." [UTM Windows guide](https://docs.getutm.app/guides/windows/)
- Official ARM64 ISO: "This option is for users that want to create a Windows 11 on Arm virtual machine on
  supported hardware." [Microsoft: Windows 11 Arm64 download](https://www.microsoft.com/en-us/software-download/windows11arm64)
- Windows 11 Enterprise evaluation is "a 90-day evaluation", offered as "x64 ISO and Arm64 ISO"; "A product
  key is not required". [Microsoft Evaluation Center](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise)
- The former developer-VM URL now redirects to [Windows dev environment docs](https://learn.microsoft.com/windows/dev-environment/), which offer no VMs (observed via the redirect).
- Prism: "Windows 11 on Arm supports emulation of both x86 and x64 apps"; "emulation only supports user mode
  code and doesn't support drivers". [Microsoft: x86 emulation on Arm](https://learn.microsoft.com/en-us/windows/arm/apps-on-arm-x86-emulation)
- WebGPU: Chrome's troubleshooting guide attributes a null adapter to blocklisting or disabled graphics
  acceleration; no source was found stating WebGPU works in a Mac-hosted Windows VM.
  [Chrome WebGPU troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)
- Azure NVads A10 v5: "powered by NVIDIA A10 GPUs", "from 1/6th of a GPU with 4-GiB frame buffer to a full
  A10 GPU", each with "a GRID license". [Azure NVadsA10v5 sizes](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/gpu-accelerated/nvadsa10v5-series)
  The Azure retail price API (East US, on demand) returned $0.73/h (Windows) for `Standard_NV6ads_A10_v5`
  and $4.856/h for `Standard_NV36ads_A10_v5`. [Azure retail prices API](https://prices.azure.com/api/retail/prices?$filter=armSkuName%20eq%20%27Standard_NV6ads_A10_v5%27%20and%20armRegionName%20eq%20%27eastus%27%20and%20priceType%20eq%20%27Consumption%27)
- AWS G4dn/G5/G6 on Windows: Tesla drivers run in TCC (compute-only) mode; GRID and Gaming drivers in WDDM
  mode (compute and graphics). [AWS: Install NVIDIA drivers](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/install-nvidia-driver.html)
- "The Remote Desktop client for macOS isn't available for download anymore and it's replaced by Windows App".
  [Microsoft: Remote Desktop for Mac](https://learn.microsoft.com/en-us/windows-server/remote/remote-desktop-services/clients/remote-desktop-mac)
- GitHub-hosted Windows runners include `windows-latest` and `windows-11-arm`; GPU larger runners (Tesla T4,
  Ubuntu or Windows) are "available for organizations and enterprises on GitHub Team and GitHub Enterprise
  Cloud plans". [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Larger runners](https://docs.github.com/en/actions/reference/runners/larger-runners)
- Claude desktop: "For Windows ARM64, download the ARM64 installer" (separate x64 installer).
  [Claude Code desktop](https://code.claude.com/docs/en/desktop)
- Codex on Windows ships as the ChatGPT desktop app from the Microsoft Store
  (`winget install --id 9PLM9XGG6VKS -s msstore`); its agent runs in PowerShell with a native Windows
  sandbox or in WSL2, and "WSL1 is no longer supported". [OpenAI: Windows app](https://learn.chatgpt.com/docs/windows/windows-app)

## 2. Installing the media stack on Windows

### Package managers and Python

- WinGet is "available on Windows 11, modern versions of Windows 10, and Windows Server 2025 as a part of the
  App Installer"; "When running WinGet without administrator privileges, some applications may require
  elevation to install." [Microsoft: WinGet](https://learn.microsoft.com/en-us/windows/package-manager/winget/)
- WinGet manifests exist for `Gyan.FFmpeg`, `BtbN.FFmpeg`, `Python.Python.3.11`, `Git.Git`,
  `OpenJS.NodeJS.LTS`, `astral-sh.uv` and `Nvidia.CUDA` (manifest folders resolved in
  [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs/tree/master/manifests)).
- Scoop "Eliminates User Account Control (UAC) prompt notifications" and installs from "a regular (non-admin)
  PowerShell terminal". [Scoop README](https://raw.githubusercontent.com/ScoopInstaller/Scoop/master/README.md)
- uv installs with `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`.
  [uv installation](https://docs.astral.sh/uv/getting-started/installation/) It "uses pre-built distributions
  from the Astral python-build-standalone project". [uv Python versions](https://docs.astral.sh/uv/concepts/python-versions/)
- uv platform tiers: "Windows (x86_64)" is Tier 1; "Windows (arm64)" is Tier 2, "continuously built, but the
  uv test suite is not run on them". [uv platform policy](https://docs.astral.sh/uv/reference/policies/platforms/)
- python-build-standalone `aarch64-pc-windows-msvc`: "Windows 64-bit ARM CPUs. Available for CPython 3.11 and
  newer." [python-build-standalone: running](https://gregoryszorc.com/docs/python-build-standalone/main/running.html)

### FFmpeg

- "FFmpeg only provides source code", linking Windows builds from gyan.dev and BtbN.
  [FFmpeg download](https://ffmpeg.org/download.html)
- gyan.dev: "All builds are 64-bit, static and licensed as GPLv3". [gyan.dev builds](https://www.gyan.dev/ffmpeg/builds/)
- BtbN variants: "`lgpl` Lacking libraries that are GPL-only. Most prominently libx264 and libx265".
  [BtbN FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) Its latest release lists `winarm64` GPL and
  LGPL archives (GitHub releases API).
- If GPL parts are enabled "the GPL applies to all of FFmpeg"; the LGPL checklist includes dynamic linking
  and distributing the matching source "no matter if you modified it or not". [FFmpeg legal](https://ffmpeg.org/legal.html)

### Transcription, alignment and ML

- whisper.cpp build release b5454 (2026-10-06) lists `whisper-bin-x64.zip`, `whisper-blas-bin-x64.zip`,
  `whisper-bin-win-cuda-12.4.0-x64.zip`, `whisper-bin-win-cpu-arm64.zip` and others (GitHub releases API);
  the README lists Vulkan, CUDA, OpenVINO and other backends.
  [whisper.cpp README](https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/README.md)
- MFA installs with `conda create -n aligner -c conda-forge montreal-forced-aligner`.
  [MFA installation](https://montreal-forced-aligner.readthedocs.io/en/latest/installation.html) Its native
  dependencies (kaldi, kalpy) are published for win-64 but not win-arm64 on conda-forge (anaconda.org API).
- PyTorch stable offers Windows CUDA indexes (`cu126`, `cu130`, `cu132`) and CPU; "ROCm is not available on
  Windows". [PyTorch: get started](https://pytorch.org/get-started/locally/)
- "With PyTorch 2.7 release, developers can now access Arm native builds of PyTorch for Windows available for
  Python 3.12." [Windows Developer Blog](https://blogs.windows.com/windowsdeveloper/2025/04/23/pytorch-arm-native-builds-now-available-for-windows/)
  `download.pytorch.org/whl/cpu` lists `torch-2.14.1+cpu` `win_arm64` wheels for cp311–cp313; no CUDA
  ARM64 Windows wheels were listed.
- `torch-directml`'s latest PyPI release is `0.2.5.dev240914` (2024-09-15). [PyPI torch-directml](https://pypi.org/project/torch-directml/)
- SAM2: "If you are installing on Windows, it's strongly recommended to use Windows Subsystem for Linux (WSL)
  with Ubuntu." [SAM2 INSTALL.md](https://raw.githubusercontent.com/facebookresearch/sam2/main/INSTALL.md)
- Demucs: "this repository is not maintained anymore"; "On Windows, torchaudio has limited support, so we rely
  on ffmpeg." [Demucs README](https://raw.githubusercontent.com/facebookresearch/demucs/main/README.md)
- ONNX Runtime execution providers include CUDA, TensorRT, DirectML, QNN, OpenVINO and WebGPU.
  [ONNX Runtime execution providers](https://onnxruntime.ai/docs/execution-providers/)
- "DirectML is in sustained engineering … new feature development has moved to Windows ML".
  [Microsoft: DirectML](https://learn.microsoft.com/en-us/windows/ai/directml/dml)
- Windows ML is "powered by ONNX Runtime"; NPU and IHV GPU execution providers "require Windows 11 version 24H2
  (build 26100) or greater". [Windows ML overview](https://learn.microsoft.com/en-us/windows/ai/new-windows-ml/overview)
- QNN's Windows ARM64 package requires "Python 3.11.x"; "The QNN HTP backend only supports quantized models."
  [ONNX Runtime QNN](https://onnxruntime.ai/docs/execution-providers/QNN-ExecutionProvider.html)

## 3. Hardware detection

- `Win32_VideoController.AdapterRAM` is `uint32`; "Hardware that is not compatible with Windows Display Driver
  Model (WDDM) returns inaccurate property values". [Win32_VideoController](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-videocontroller)
- `nvidia-smi` supports "64bit versions of Windows starting with Windows Server 2008 R2"; `--query-gpu` takes a
  "comma separated list of properties". [nvidia-smi documentation](https://docs.nvidia.com/deploy/nvidia-smi/index.html)
- A 64-bit process sees `PROCESSOR_ARCHITECTURE` `AMD64` or `ARM64`. [WOW64 implementation details](https://learn.microsoft.com/en-us/windows/win32/winprog64/wow64-implementation-details)
- Before .NET 7, `OSArchitecture` "returned Architecture.X64 in emulated processes on Windows Arm 64-bit".
  [.NET 7 breaking change](https://learn.microsoft.com/en-us/dotnet/core/compatibility/interop/7.0/osarchitecture-emulation)

## 4. Node.js process management on Windows

- Node v24 LTS ships `win-x64` installers and `win-arm64` zip/7z archives. [Node.js dist index](https://nodejs.org/dist/index.json)
- `detached` on Windows "makes it possible for the child process to continue running after the parent exits.
  The child process will have its own console window"; process groups are described only for other
  platforms. [Node child_process](https://raw.githubusercontent.com/nodejs/node/main/doc/api/child_process.md)
- `taskkill /t` "Ends the specified process and any child processes started by it".
  [taskkill](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill)
- "Node.js will now error with EINVAL if a .bat or .cmd file is passed to child_process.spawn and
  child_process.spawnSync without the shell option set". [Node April 2024 security release](https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2)
- `shell: true` with an argument array is deprecated (DEP0190): "the values are not escaped, only
  space-separated, which can lead to shell injection". [Node deprecations](https://raw.githubusercontent.com/nodejs/node/main/doc/api/deprecations.md)

## Unverified or contested

- Whether WebGPU works inside a Parallels, VMware or UTM Windows guest: no primary source either way.
- Whether current Parallels versions remain on Microsoft's authorized list (the page names 18–20).
- Codex desktop app architecture support (x64 vs ARM64) is not stated officially.
- Whether uv-managed Python and each WinGet package install per user without elevation is not stated.
- AWS on-demand Windows GPU prices were not obtainable from official pages.
- MFA on Windows ARM64 is undocumented; the gap is inferred from conda-forge platform listings.
- torch-directml's maintenance status is inferred from release dates; the project states none.

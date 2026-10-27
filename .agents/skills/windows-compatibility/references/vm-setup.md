# Windows test VM on an Apple Silicon Mac

One-time setup, about an hour. Steps marked **owner** show licence terms or need someone at the screen:
an agent may drive them only with the owner's approval of each licence.

1. Install UTM (`brew install --cask utm`) and download the **Windows 11 Arm64 ISO** from
   https://www.microsoft.com/software-download/windows11arm64 (about 8 GB).
2. In UTM: Create a New Virtual Machine, Virtualize, Windows. Keep "Install Windows 10 or higher" and
   "Install drivers and SPICE tools" ticked, choose the ISO, give it 8 GB memory and 4 to 6 cores, and
   64 GB storage (it grows only as used). No shared folder.
3. **Owner:** start it, press a key at "boot from CD", choose "I don't have a product key" and
   Windows 11 Pro, accept Microsoft's licence terms, install onto the empty disk, and create a local
   user. Unactivated Windows shows a watermark, which is fine for testing.
4. **Owner:** in File Explorer open the UTM Guest Tools CD and run `utm-guest-tools` (open-source
   driver licences), then restart if asked. This enables networking and copy-paste with the Mac.
5. On the Mac, make a key once: `ssh-keygen -t ed25519 -N "" -C dreamcut-vm-build -f ~/.ssh/dreamcut_vm`.
6. In an Administrator PowerShell in the VM, run [../scripts/enable-ssh.ps1](../scripts/enable-ssh.ps1)
   with `-PublicKey` set to the contents of `~/.ssh/dreamcut_vm.pub` (paste works after step 4). It
   prints the VM's address; set `DREAMCUT_VM_HOST` and `DREAMCUT_VM_USER` on the Mac.
7. From the Mac, install the tools. `--architecture x64` matters: it gives the x64 Node most Windows
   users have, which Windows on Arm runs under emulation.

   ```bash
   scripts/vm.sh 'winget install --id OpenJS.NodeJS.LTS --architecture x64 --source winget --silent --accept-package-agreements --disable-interactivity'
   scripts/vm.sh 'foreach ($id in "Git.Git","Gyan.FFmpeg","Google.Chrome") { winget install --id $id --source winget --silent --accept-package-agreements --disable-interactivity }'
   scripts/vm.sh 'npm install -g pnpm@10.18.3; git config --global core.longpaths true; node -p process.arch'
   ```

   `--accept-package-agreements` accepts each package's own licence; confirm the owner is content with that.

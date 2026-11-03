#!/bin/sh
# Start DreamCut from the VM's source checkout the way a user's install runs it (`node bin/dreamcut.mjs`),
# with Chrome open for remote control, forward Chrome's debugging port to this Mac, and print the editor's
# single-use sign-in link. Run after install-and-verify.ps1. Uses the same settings as vm.sh, plus
#   DREAMCUT_VM_CDP_PORT  Mac port forwarded to the VM's Chrome (default 9229)
set -eu
: "${DREAMCUT_VM_HOST:?Set DREAMCUT_VM_HOST to the VM address}"
: "${DREAMCUT_VM_USER:?Set DREAMCUT_VM_USER to the Windows user}"
KEY="${DREAMCUT_VM_KEY:-$HOME/.ssh/dreamcut_vm}"
PORT="${DREAMCUT_VM_CDP_PORT:-9229}"
HERE="$(cd "$(dirname "$0")" && pwd)"
START='C:\dev\dreamcut\.agents\skills\windows-compatibility\scripts\vm\start-editor.ps1'
# The running editor holds its log open, so it is stopped before the log is removed; otherwise the loop
# would read the earlier link while the task restarts the editor.
"$HERE/vm.sh" "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 1; Remove-Item C:\\dev\\winui\\editor.log -ErrorAction SilentlyContinue; if (Test-Path C:\\dev\\winui\\editor.log) { 'The previous editor log could not be removed.'; exit 1 }; schtasks /create /f /tn DreamCutEditor /sc once /st 23:59 /it /tr \"powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $START\" | Out-Null; schtasks /run /tn DreamCutEditor | Out-Null; for (\$i = 0; \$i -lt 900; \$i++) { Start-Sleep 2; if (-not (Test-Path C:\\dev\\winui\\editor.log)) { continue }; \$link = Select-String -Path C:\\dev\\winui\\editor.log -Pattern '^http' -ErrorAction SilentlyContinue | Select-Object -First 1; if (\$link) { \$link.Line; exit 0 } }; 'No sign-in link after 30 minutes:'; Get-Content C:\\dev\\winui\\editor.log, C:\\dev\\winui\\editor.err -Tail 20 -ErrorAction SilentlyContinue; exit 1"
if ! nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
  ssh -f -N -i "$KEY" -o UserKnownHostsFile="$HOME/.ssh/known_hosts_dreamcut_vm" -o LogLevel=ERROR -o BatchMode=yes \
    -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L "$PORT:127.0.0.1:9222" "$DREAMCUT_VM_USER@$DREAMCUT_VM_HOST"
fi

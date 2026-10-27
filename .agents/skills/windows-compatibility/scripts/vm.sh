#!/bin/sh
# Run a PowerShell command in the Windows test VM over SSH.
#   DREAMCUT_VM_HOST  VM address (UTM shared network, e.g. 192.168.64.3)   required
#   DREAMCUT_VM_USER  Windows user                                          required
#   DREAMCUT_VM_KEY   private key (default ~/.ssh/dreamcut_vm)
# Commands start in a fresh PowerShell session with PATH reloaded, so tools installed by winget are found.
set -eu
: "${DREAMCUT_VM_HOST:?Set DREAMCUT_VM_HOST to the VM address}"
: "${DREAMCUT_VM_USER:?Set DREAMCUT_VM_USER to the Windows user}"
KEY="${DREAMCUT_VM_KEY:-$HOME/.ssh/dreamcut_vm}"
PATHS='$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User");'
exec ssh -i "$KEY" -o UserKnownHostsFile="$HOME/.ssh/known_hosts_dreamcut_vm" -o StrictHostKeyChecking=accept-new \
  -o LogLevel=ERROR -o ConnectTimeout=10 -o BatchMode=yes -o ServerAliveInterval=30 \
  "$DREAMCUT_VM_USER@$DREAMCUT_VM_HOST" "$PATHS $*"

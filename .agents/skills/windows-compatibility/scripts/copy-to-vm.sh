#!/bin/sh
# Copy a file, or with no argument this checkout's working copy (tracked and untracked, not ignored, not
# projects/), to C:\dev\dreamcut in the Windows test VM. Uses the same settings as vm.sh.
set -eu
: "${DREAMCUT_VM_HOST:?Set DREAMCUT_VM_HOST to the VM address}"
: "${DREAMCUT_VM_USER:?Set DREAMCUT_VM_USER to the Windows user}"
KEY="${DREAMCUT_VM_KEY:-$HOME/.ssh/dreamcut_vm}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
SCP="scp -q -i $KEY -o UserKnownHostsFile=$HOME/.ssh/known_hosts_dreamcut_vm -o LogLevel=ERROR"
if [ $# -gt 0 ]; then
  for file in "$@"; do $SCP "$REPO/$file" "$DREAMCUT_VM_USER@$DREAMCUT_VM_HOST:C:/dev/dreamcut/$file"; done
  exit 0
fi
ARCHIVE="$(mktemp -t dreamcut-src).tgz"
# Files deleted but not yet committed are skipped. The VM's copy is replaced except dependencies and
# build output, so a file removed here (tracked or not) is gone there too.
(cd "$REPO" && git ls-files -co --exclude-standard -z | perl -0ne 'print if !m{^projects/} && -e substr($_, 0, -1)' | tar --null -T - -czf "$ARCHIVE")
$SCP "$ARCHIVE" "$DREAMCUT_VM_USER@$DREAMCUT_VM_HOST:C:/dev/dreamcut-src.tgz"
rm -f "$ARCHIVE"
"$HERE/vm.sh" 'New-Item -ItemType Directory -Force C:\dev\dreamcut | Out-Null; Get-ChildItem -Force C:\dev\dreamcut | Where-Object { $_.Name -notin @("node_modules", ".next", "dist", ".desktop-build") } | Remove-Item -Recurse -Force; tar -xzf C:\dev\dreamcut-src.tgz -C C:\dev\dreamcut; Remove-Item C:\dev\dreamcut-src.tgz; "copied to C:\dev\dreamcut"'

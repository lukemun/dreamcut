#!/bin/bash
# DreamCut for ChatGPT Desktop. Installs only into your home folder; never uses sudo.
main() {
set -euo pipefail
fail() { printf '\nDreamCut setup stopped: %s\n' "$*" >&2; exit 1; }
[ "$(uname -s)" = Darwin ] || fail 'This installer supports Apple Silicon Macs. See https://dreamcut.io/install.'
arch=$(uname -m)
if [ "$arch" != arm64 ]; then
  [ "$(/usr/sbin/sysctl -in sysctl.proc_translated 2>/dev/null || true)" = 1 ] || fail 'An Apple Silicon Mac is required. Intel and Windows builds are not available yet.'
fi
# Override only for disposable installer verification; ordinary setup uses the current home.
install_home=${DREAMCUT_INSTALL_HOME:-$HOME}
[ -d "$install_home" ] || fail 'Your home folder could not be found.'
root="$install_home/Library/Application Support/DreamCut/plugin-runtime"
mkdir -p "$root"
available_kb=$(df -Pk "$root" | awk 'END {print $4}')
case "$available_kb" in ''|*[!0-9]*) fail 'Could not check available disk space.';; esac
[ "$available_kb" -ge 5242880 ] || fail 'Free at least 5 GB of disk space, then run setup again.'
lock="$root/.setup-lock"
mkdir "$lock" 2>/dev/null || fail 'Another setup may be running. If it was interrupted, remove the .setup-lock folder in DreamCut/plugin-runtime and retry.'
scratch=''
cleanup() { [ -z "$scratch" ] || rm -rf "$scratch"; rmdir "$lock" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 130' INT TERM
scratch=$(mktemp -d "$root/.setup.XXXXXX")
node_name='node-v24.19.0-darwin-arm64'
node_sha='8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d'
node_dir="$root/$node_name"
verify() { printf '%s  %s\n' "$1" "$2" | /usr/bin/shasum -a 256 -c - >/dev/null || fail 'A download did not match its checksum. Nothing from that download was installed.'; }
download() { /usr/bin/curl --fail --location --proto '=https' --proto-redir '=https' --retry 3 --connect-timeout 20 --max-time 600 --output "$2" "$1" || fail 'Download failed. Check your connection and run setup again.'; }
printf 'Setting up DreamCut for ChatGPT…\n'
if [ ! -x "$node_dir/bin/node" ] || [ "$("$node_dir/bin/node" --version 2>/dev/null || true)" != v24.19.0 ]; then
  [ ! -e "$node_dir" ] || fail 'The private Node runtime is incomplete. Remove its node-v24.19.0-darwin-arm64 folder and retry.'
  printf 'Downloading the local runtime…\n'
  download "https://nodejs.org/dist/v24.19.0/$node_name.tar.gz" "$scratch/node.tar.gz"
  verify "$node_sha" "$scratch/node.tar.gz"
  /usr/bin/tar -xzf "$scratch/node.tar.gz" -C "$scratch"
  "$scratch/$node_name/bin/node" --version >/dev/null || fail 'The downloaded runtime could not start.'
  mv "$scratch/$node_name" "$node_dir"
fi
printf 'Downloading the plugin…\n'
download 'https://dreamcut.io/downloads/chatgpt/dreamcut-chatgpt-0.1.2.tar.gz' "$scratch/plugin.tar.gz"
verify '__PAYLOAD_SHA256__' "$scratch/plugin.tar.gz"
/usr/bin/tar -xzf "$scratch/plugin.tar.gz" -C "$scratch"
"$node_dir/bin/node" "$scratch/plugin/setup.mjs" --home "$install_home"
}
main "$@"

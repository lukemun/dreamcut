# Security policy

## Reporting a vulnerability

Report a suspected vulnerability privately through [dreamcut.io](https://dreamcut.io), with
reproduction steps, affected versions and impact. Do not post it publicly.

Do not include real user media, credentials, or private project files in a
report. A minimal synthetic reproduction is preferred.

## Supported version

Security fixes target the current default branch. Earlier releases do not receive
security updates.

## Local security boundary

DreamCut stores projects and media locally and its local HTTP API does not
provide authentication. The standard development, start, and review commands
therefore bind to `127.0.0.1`. Do not expose the editor to a LAN or public
network without adding an appropriate authentication and network-security
layer.

# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private vulnerability-reporting or security-advisory flow for this repository
to share reproduction steps, affected versions, and impact with the maintainer.
If that flow is unavailable, contact the repository owner privately through the
contact information on their GitHub profile.

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

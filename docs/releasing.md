# Releasing DreamCut

The editor ships as a small npm launcher (`dreamcut`) that downloads a ready-built runtime from this
repository's GitHub Releases. On each supported platform, with Node 22 or 24:

1. Bump `version` in `package.json` and add a matching `CHANGELOG.md` section.
2. Build the runtime: `pnpm desktop:build`, `node desktop/package.mjs --service-only`, then
   `node packaging/build-web-runtime.mjs`.
3. Pack and check the launcher: `node packaging/pack-launcher.mjs`, then `node packaging/verify-web-runtime.mjs`.
4. Publish the release: `node packaging/publish-release.mjs --dry-run`, then without `--dry-run`.
5. Publish the launcher when it changed: `npm publish dist/npm/dreamcut-<version>.tgz`. Installed
   launchers pick up new runtimes from the latest release on their own.

Publishing needs the maintainer's GitHub CLI sign-in and npm login. Large uploads can fail over some VPNs; disconnect and retry.

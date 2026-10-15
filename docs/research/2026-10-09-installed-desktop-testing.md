# Installed desktop testing — sourced findings

Date: 2026-10-09. Method: read primary Electron, Playwright, Apple and Forge documentation; retain a [source inventory](raw/installed-desktop-testing/sources.md). Product-specific acceptance criteria live in the separate [local installer plan](../architecture/local-installer-testing.md).

Electron documents end-to-end testing through WebdriverIO and Playwright, including selecting a bundled application executable rather than relying only on a development entry point. [Electron automated testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing).

Playwright's Electron support is experimental. Its launch API accepts an executable path, working directory and environment. Native Electron dialogs are not intercepted as browser dialogs; the documentation describes stubbing them in the main process for deterministic tests. It also identifies the Node CLI inspection fuse as a possible launch blocker. These documented automation constraints do not establish native-dialog or production-fuse acceptance. [Playwright Electron API](https://playwright.dev/docs/api/class-electron).

Apple describes notarization as an automated malicious-content and signing check, distinct from App Review. It requires valid signatures, Developer ID, hardened runtime and secure timestamps. Apple explicitly advises reviewing notary-log warnings and testing before distribution because notarized software can still encounter runtime or signing problems. [Apple notarization documentation](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

Electron documents that signed identity affects macOS Keychain behavior, login items and Squirrel.Mac updates; unsigned or ad-hoc builds can behave differently. [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).

Electron's security checklist covers renderer isolation, sandboxing, permission handling, navigation restrictions and IPC sender validation. [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

Forge documents DMGs as drag-to-Applications distribution containers built on macOS. For its static-file macOS update flow, ZIP artifacts are additional outputs. [Forge DMG documentation](https://www.electronforge.io/config/makers/dmg). Electron's updater documentation describes separate platform implementations. [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater).

## Limits

These sources document capabilities and constraints; they do not certify this application's installer. Passing framework automation does not establish the untested OS permission or installer interactions. Exact supported operating-system releases, hardware performance and this application's upgrade compatibility require separate product qualification.

# Installed desktop testing: source inventory

Retrieved 2026-10-09. These are attributed short excerpts, not full captures. Public primary documentation only; local build logs and private UI evidence are not published.

- Electron, [Automated Testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing), introduction: “Test automation is an efficient way of validating that your application code works as intended.” Scope: end-to-end frameworks and bundled executable selection. Retrieved HTML.
- Playwright, [Electron](https://playwright.dev/docs/api/class-electron), introduction: “Playwright has experimental support for Electron automation.” Scope: executablePath, native-dialog limitations, required debugging fuse. Retrieved HTML.
- Apple, [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), discussion: “Notarization of macOS software is not App Review.” Scope: tickets, signatures, hardened runtime, testing after notarization. HTML was a JavaScript shell; recovered its official `.md` representation with a direct HTTP fetch.
- Electron, [Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing), macOS APIs: “Squirrel.Mac requires the app to be signed for automatic updates to work at all.” Scope: signed identity and OS integration. Retrieved HTML.
- Electron, [Security](https://www.electronjs.org/docs/latest/tutorial/security), checklist: “Validate the sender of all IPC messages”. Scope: isolation, sandboxing, navigation and permission handlers. Retrieved HTML.
- Electron Forge, [DMG](https://www.electronforge.io/config/makers/dmg), requirements: “You can only build the DMG target on macOS machines.” Scope: drag-to-Applications distribution and separate ZIP update artifact. Retrieved text.
- Electron, [autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater), platform documentation. Scope: platform-specific updates. Retrieved HTML; no verbatim excerpt retained.

Retrieval notes: the older `testing-overview` URL failed; the current official `automated-testing` page provided the relevant material. A guessed Apple `testing-a-notarized-app` URL was not used as evidence; the recovered notarization article itself explicitly covers testing. No absence claim is inferred from failed URLs.

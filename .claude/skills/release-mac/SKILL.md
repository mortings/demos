---
name: release-mac
description: Build Flyt and install it as /Applications/Flyt.app on this Mac. Use when asked to release, install, reinstall, rebuild the app, "ship it to my Mac", or after code changes the user wants to try in the installed app.
---

# Release Flyt to /Applications

1. Run the checks first; do not install a broken build:
   ```bash
   npm run typecheck && npm test
   ```
2. Build, sign and install:
   ```bash
   npm run install:mac
   ```
   This runs `scripts/install-mac.sh`: `npm run build`, `electron-builder --mac --dir` for the local architecture, ad-hoc signing via `build/after-pack.js`, `ditto` into `/Applications/Flyt.app`, then opens it.
3. Remind the user, only if relevant:
   - A dev copy (`npm start`) must be quit first; only one Flyt runs at a time.
   - With an ad-hoc signature, macOS forgets Accessibility and Microphone grants after each rebuild; re-grant in Settings → Setup. With `CSC_NAME` set to a Developer ID identity this does not happen.
   - API keys survive reinstalls (same Keychain entry for the installed app).
4. Verify by asking the user to hold right ⌥ in a text field; check `~/Library/Application Support/Flyt/history.json` grows if they report nothing happened.

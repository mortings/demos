#!/bin/sh
# Build Flyt as a real macOS app and install it into /Applications.
set -e
cd "$(dirname "$0")/.."

ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then EB_ARCH="--arm64"; OUT="release/mac-arm64"; else EB_ARCH="--x64"; OUT="release/mac"; fi

echo "▶ Building Flyt ($ARCH)…"
npm run build
npx electron-builder --mac --dir $EB_ARCH

APP="$OUT/Flyt.app"
if [ ! -d "$APP" ]; then echo "Build output not found at $APP" >&2; exit 1; fi

echo "▶ Installing to /Applications…"
osascript -e 'tell application "Flyt" to quit' >/dev/null 2>&1 || true
sleep 1
rm -rf /Applications/Flyt.app
ditto "$APP" /Applications/Flyt.app

echo "▶ Launching…"
open /Applications/Flyt.app
echo
echo "Flyt is installed. If a Terminal is still running the development copy (npm start), press Ctrl+C there:"
echo "only one Flyt can run at a time."
echo "macOS treats the installed app as new: grant Microphone and Accessibility to “Flyt” once in Settings → Setup"
echo "and paste your API keys again (they are stored per app in the Keychain)."

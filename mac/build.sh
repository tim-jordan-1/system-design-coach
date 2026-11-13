#!/bin/sh
# Builds "System Design Coach.app" and puts it in ~/Applications, or in the folder that you give.
# The app runs its own copy of the coach code. After you change that code, run this script again.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
coach=$(dirname "$here")
dest=${1:-"$HOME/Applications"}
command -v swiftc >/dev/null 2>&1 || { echo "swiftc is missing. Run: xcode-select --install" >&2; exit 1; }
[ "$(sw_vers -productVersion | cut -d. -f1)" -ge 26 ] || { echo "This app needs macOS 26 or later (you have $(sw_vers -productVersion))." >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
app="$work/System Design Coach.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/coach"

swiftc -O -swift-version 5 -o "$app/Contents/MacOS/SystemDesignCoach" "$here/main.swift" "$here/Dictation.swift"
cp "$here/Info.plist" "$app/Contents/Info.plist"
res="$app/Contents/Resources/coach"
mkdir "$res/lib" "$res/public"
cp "$coach/server.mjs" "$res/"
cp "$coach"/lib/*.mjs "$res/lib/"
for f in index.html app.js app.css dictation.mjs; do cp "$coach/public/$f" "$res/public/"; done

swiftc -O -o "$work/icon" "$here/icon.swift"
"$work/icon" "$work/icon.png"
mkdir "$work/AppIcon.iconset"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" "$work/icon.png" --out "$work/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z "$((s * 2))" "$((s * 2))" "$work/icon.png" --out "$work/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns -o "$app/Contents/Resources/AppIcon.icns" "$work/AppIcon.iconset"

codesign --force --options runtime --entitlements "$here/entitlements.plist" --sign - "$app"
mkdir -p "$dest"
rm -rf "$dest/System Design Coach.app"
mv "$app" "$dest/"
echo "Built $dest/System Design Coach.app"

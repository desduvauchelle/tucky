#!/usr/bin/env bash
# Create a Finder installer with a deterministic layout before signing it.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="${1:?Usage: create-macos-dmg.sh APP OUTPUT}"
OUTPUT="${2:?Usage: create-macos-dmg.sh APP OUTPUT}"
[[ -d "$APP" ]] || { echo "App bundle missing: $APP" >&2; exit 1; }
WORK="$(mktemp -d)"
MOUNT="$WORK/mounted"
ATTACHED=0
cleanup() {
  if [[ "$ATTACHED" == 1 ]]; then
    hdiutil detach "$MOUNT" -quiet || hdiutil detach "$MOUNT" -force -quiet
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT
mkdir -p "$WORK/content/.background" "$MOUNT"
xcrun swift "$ROOT/scripts/dmg-background.swift" "$WORK/content/.background/install.png"
ditto "$APP" "$WORK/content/Tucky.app"
ln -s /Applications "$WORK/content/Applications"
hdiutil create -volname Tucky -srcfolder "$WORK/content" -format UDRW -ov "$WORK/installer.dmg"
hdiutil attach "$WORK/installer.dmg" -mountpoint "$MOUNT" -nobrowse -noautoopen -quiet
ATTACHED=1
osascript - "$MOUNT" <<'APPLESCRIPT'
on run argv
  set installer to POSIX file (item 1 of argv) as alias
  tell application "Finder"
    open installer
    set installerWindow to container window of installer
    set current view of installerWindow to icon view
    set toolbar visible of installerWindow to false
    set statusbar visible of installerWindow to false
    -- Leave room for Finder's title, tab, and path bars, which depend on
    -- the recipient's preferences, without cropping the instructions.
    set bounds of installerWindow to {180, 120, 900, 670}
    set options to icon view options of installerWindow
    set arrangement of options to not arranged
    set icon size of options to 112
    set text size of options to 14
    set background picture of options to file ".background:install.png" of installer
    set position of item "Tucky.app" of installerWindow to {176, 234}
    set position of item "Applications" of installerWindow to {544, 234}
    close installerWindow
    open installer
    update installer without registering applications
    delay 2
    close container window of installer
  end tell
end run
APPLESCRIPT
[[ -f "$MOUNT/.DS_Store" ]] || { echo "Finder did not save installer layout." >&2; exit 1; }
sync
hdiutil detach "$MOUNT" -quiet
ATTACHED=0
hdiutil convert "$WORK/installer.dmg" -format UDZO -o "$OUTPUT" -ov
hdiutil verify "$OUTPUT"

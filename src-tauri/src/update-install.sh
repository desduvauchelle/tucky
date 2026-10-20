#!/bin/bash
# Embedded in updater.rs. All arguments are positional; never interpolate paths
# into shell source. Production callers provide a system-only PATH.
set -euo pipefail
REQUIREMENT='=anchor apple generic and identifier "com.echoscribe.app" and certificate leaf[subject.OU] = "BSH2UEDLU5" and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists'
verify_app() {
  local app="$1" version="$2"
  [[ -d "$app" && ! -L "$app" && -x "$app/Contents/MacOS/Tucky" ]] || return 1
  codesign --verify --deep --strict -R "$REQUIREMENT" "$app" || return 1
  spctl --assess --type execute "$app" || return 1
  [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")" == "$version" ]]
}
if [[ "${1:-}" == --verify ]]; then
  verify_app "$2" "$3"
  exit $?
fi

TARGET="${1:?}" STAGED="${2:?}" OLD_PID="${3:?}" VERSION="${4:?}" TOKEN="${5:?}" LOG="${6:?}"
[[ "$TOKEN" =~ ^[a-zA-Z0-9-]+$ && "$OLD_PID" =~ ^[0-9]+$ ]] || exit 1
exec >> "$LOG" 2>&1
PENDING="$(dirname "$STAGED")"
HEALTH="$PENDING/health-$TOKEN"
CANDIDATE="$TARGET.update-new-$TOKEN"
BACKUP="$TARGET.update-backup-$TOKEN"
MOVED_OLD=0
INSTALLED=0
CHILD=""
SUCCESS=0
cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$SUCCESS" != 1 ]]; then
    echo "Update failed; preserving or restoring the previous app."
    if [[ -n "$CHILD" ]] && kill -0 "$CHILD" 2>/dev/null; then
      kill "$CHILD" 2>/dev/null || true
      for _ in $(seq 1 10); do kill -0 "$CHILD" 2>/dev/null || break; sleep 0.5; done
      kill -9 "$CHILD" 2>/dev/null || true
    fi
    if [[ "$INSTALLED" == 1 ]]; then rm -rf "$TARGET"; fi
    if [[ "$MOVED_OLD" == 1 ]]; then mv "$BACKUP" "$TARGET" || {
      echo "Restore failed. The previous app is safe at $BACKUP"; exit 1;
    }; fi
    if [[ -d "$TARGET" ]]; then open "$TARGET" || true; fi
    [[ "$status" != 0 ]] || status=1
  fi
  rm -rf "$CANDIDATE"
  rm -f "$HEALTH" "$0"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

[[ -d "$TARGET" && ! -L "$TARGET" && ! -e "$CANDIDATE" && ! -e "$BACKUP" ]] || exit 1
verify_app "$STAGED" "$VERSION"
# Copy and verify on the destination filesystem before touching the live app.
ditto "$STAGED" "$CANDIDATE"
verify_app "$CANDIDATE" "$VERSION"
for _ in $(seq 1 240); do kill -0 "$OLD_PID" 2>/dev/null || break; sleep 0.5; done
if kill -0 "$OLD_PID" 2>/dev/null; then echo "Old app has not exited; refusing replacement."; exit 1; fi
mv "$TARGET" "$BACKUP"
MOVED_OLD=1
mv "$CANDIDATE" "$TARGET"
INSTALLED=1
# Retain quarantine and require the real new frontend to acknowledge launch.
TUCKY_UPDATE_HEALTH_TOKEN="$TOKEN" "$TARGET/Contents/MacOS/Tucky" &
CHILD=$!
for _ in $(seq 1 90); do
  if [[ -f "$HEALTH" ]] && [[ "$(cat "$HEALTH")" == "$VERSION" ]]; then
    SUCCESS=1
    break
  fi
  kill -0 "$CHILD" 2>/dev/null || break
  sleep 1
done
[[ "$SUCCESS" == 1 ]] || { echo "New app did not confirm a healthy frontend."; exit 1; }
echo "Update $VERSION confirmed. Previous app retained at $BACKUP"
rm -rf "$STAGED"

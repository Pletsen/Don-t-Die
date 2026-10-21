#!/usr/bin/env bash
# DON'T DIE's settings on top of the iOS project that `npx cap add ios` makes.
# Runs on macOS (a Mac or a GitHub Actions macOS runner), from anywhere:
#
#   npx cap add ios && bash store/ios/configure-ios.sh && npx cap sync ios
#
# It is safe to run again. The ios/ folder is meant to be generated like this
# on every CI build, so nobody has to edit an Xcode project by hand.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/ios/App/App"
PLIST="$APP/Info.plist"
STORE="$ROOT/store"

if [ ! -f "$PLIST" ]; then
  echo "No iOS project yet: run 'npx cap add ios' first." >&2
  exit 1
fi

pb() { /usr/libexec/PlistBuddy -c "$1" "$PLIST" >/dev/null 2>&1 || true; }
# set_key KEY TYPE VALUE: replace (or add) a top-level Info.plist key.
set_key() {
  pb "Delete :$1"
  /usr/libexec/PlistBuddy -c "Add :$1 $2 $3" "$PLIST"
}
# set_list KEY VALUE...: replace a top-level array of strings.
set_list() {
  local key="$1"
  shift
  pb "Delete :$key"
  /usr/libexec/PlistBuddy -c "Add :$key array" "$PLIST"
  local i=0
  for v in "$@"; do
    /usr/libexec/PlistBuddy -c "Add :$key:$i string $v" "$PLIST"
    i=$((i + 1))
  done
}

echo "Info.plist"
set_key CFBundleDisplayName string "DON'T DIE"
# Portrait only. iPhone only for v1 (see configure-xcode.rb), so iPads run it
# in iPhone mode; the iPad list is portrait too in case that ever changes.
set_list UISupportedInterfaceOrientations UIInterfaceOrientationPortrait
set_list "UISupportedInterfaceOrientations~ipad" UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown
set_key UIRequiresFullScreen bool true
# No status bar, from the first frame (SystemBars keeps it hidden after that).
set_key UIStatusBarHidden bool true
set_key UIViewControllerBasedStatusBarAppearance bool true
# Every iPhone that runs iOS 15 is 64-bit (the template still says armv7).
set_list UIRequiredDeviceCapabilities arm64
# Export compliance: no encryption beyond what iOS itself does, so App Store
# Connect doesn't ask on every upload.
set_key ITSAppUsesNonExemptEncryption bool false

echo "Icon and launch artwork (from store/art, see store/art.cjs)"
cp "$STORE/art/icon-1024.png" "$APP/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
for f in splash-2732x2732.png splash-2732x2732-1.png splash-2732x2732-2.png; do
  cp "$STORE/art/splash-2732.png" "$APP/Assets.xcassets/Splash.imageset/$f"
done
# The launch screen's own background: the game's dark, not white.
perl -0pi -e 's/<color key="backgroundColor"[^>]*\/>/<color key="backgroundColor" red="0.0196" green="0.0275" blue="0.0392" alpha="1" colorSpace="custom" customColorSpace="sRGB"\/>/g' \
  "$APP/Base.lproj/LaunchScreen.storyboard"

echo "Entitlements and privacy manifest"
cp "$STORE/ios/App.entitlements" "$APP/App.entitlements"
cp "$STORE/ios/PrivacyInfo.xcprivacy" "$APP/PrivacyInfo.xcprivacy"

echo "Xcode project settings"
if ! ruby -e 'require "xcodeproj"' 2>/dev/null; then
  gem install xcodeproj --user-install --no-document
fi
ruby "$STORE/ios/configure-xcode.rb" "$ROOT/ios/App/App.xcodeproj"

echo "Done. Next: npx cap sync ios"

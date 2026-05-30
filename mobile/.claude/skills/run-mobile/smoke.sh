#!/usr/bin/env bash
# Run from mobile/ directory.
# Usage: bash .claude/skills/run-mobile/smoke.sh [screenshot-path]
set -euo pipefail

SCREENSHOT="${1:-/tmp/nowgo-sim.png}"
BUNDLE_ID="com.anonymous.mobile"
APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData/mobile-*/Build/Products/Debug-iphonesimulator/mobile.app -maxdepth 0 2>/dev/null | head -1)

# Ensure a booted simulator exists
BOOTED=$(xcrun simctl list devices | grep Booted | head -1)
if [ -z "$BOOTED" ]; then
  echo "No booted simulator. Boot one: xcrun simctl boot 'iPhone 17'"
  exit 1
fi

# Start Metro if not already running
if ! curl -sf http://localhost:8081/status > /dev/null 2>&1; then
  echo "Starting Metro bundler..."
  npx expo run:ios > /tmp/expo-run-ios.log 2>&1 &
  EXPO_PID=$!
  echo "expo run:ios PID: $EXPO_PID (logs: /tmp/expo-run-ios.log)"
  # Wait for Metro to be ready (up to 90s)
  for i in $(seq 1 18); do
    sleep 5
    if curl -sf http://localhost:8081/status > /dev/null 2>&1; then
      echo "Metro ready."
      break
    fi
    echo "Waiting for Metro... ($((i*5))s)"
  done
else
  echo "Metro already running on :8081"
  # Install latest build and launch
  if [ -n "$APP_PATH" ]; then
    xcrun simctl install booted "$APP_PATH"
  fi
  xcrun simctl launch booted "$BUNDLE_ID" > /dev/null
fi

# Give app time to render
sleep 6
xcrun simctl io booted screenshot "$SCREENSHOT"
echo "Screenshot: $SCREENSHOT"

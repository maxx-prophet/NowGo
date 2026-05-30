---
name: run-mobile
description: Run, start, launch, screenshot, or simulate the NowGo mobile app in the iOS simulator. Use when asked to run the app, test a UI change, take a screenshot, or verify the simulator is working.
---

NowGo mobile is an Expo SDK 54 / React Native 0.81.5 app with a native iOS build in `ios/`. It runs in the iOS Simulator via `npx expo run:ios`, which builds with Xcode, starts the Metro bundler on port 8081, and installs/launches `com.anonymous.mobile` on the booted simulator.

**Expo Go is not installed** — `exp://` URLs don't work. Always use the native build path.

## Prerequisites

- Xcode + iOS Simulator (already installed on this machine)
- CocoaPods already installed (`ios/Pods/` exists — no `pod install` needed unless you add native deps)
- Node deps installed (`node_modules/` exists)
- A booted simulator: `xcrun simctl list devices | grep Booted`

## Run (agent path)

From `mobile/`:

```bash
bash .claude/skills/run-mobile/smoke.sh /tmp/nowgo-screenshot.png
```

This starts Metro (via `npx expo run:ios`) if it's not already running, installs the app, launches it, waits for render, and writes a PNG screenshot.

**If Metro is already running** (port 8081 live), the script reinstalls the latest build and re-launches — no full rebuild needed. Full rebuild via `expo run:ios` takes ~30-60s.

Screenshot the running app at any time:
```bash
xcrun simctl io booted screenshot /tmp/snap.png
```

Re-launch without rebuilding (Metro must be running):
```bash
xcrun simctl install booted $(find ~/Library/Developer/Xcode/DerivedData/mobile-*/Build/Products/Debug-iphonesimulator/mobile.app -maxdepth 0 | head -1)
xcrun simctl launch booted com.anonymous.mobile
```

## Run (human path)

```bash
cd mobile
npx expo run:ios
```

Opens the simulator automatically, starts Metro, streams logs. Press `r` to reload JS. Ctrl-C stops Metro (simulator keeps the app installed).

## API config

`src/api/nowgo.js` hardcodes `API_BASE = "https://nowgo-production.up.railway.app"`.  
To point at the local backend instead, change that to `http://localhost:4000` and restart Metro (`r` in the Expo terminal).

## Gotchas

- **`exp://` URL fails** — Expo Go isn't installed and fetch-install fails on this machine. Only `npx expo run:ios` (native build) works.
- **"No script URL provided" red screen** — the app launched from DerivedData without Metro running. Start Metro first, then re-launch.
- **Port 8081 already in use** — check `lsof -i :8081`; kill the stale process before running.
- **Metro hangs after "Waiting on http://localhost:8081"** — usually a previous Metro/node process holding the port. Kill it and retry.
- **`expo@54.0.34` version warning** — `~54.0.35` is expected. Non-blocking; app runs fine. Run `npm install expo@~54.0.35` to clear it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Red screen "No script URL provided" | Metro is not running. Run `npx expo run:ios` or start Metro first. |
| `expo run:ios` exits immediately with "TypeError: fetch failed" | It tried to install Expo Go and failed. This is the `--ios` flag behavior when no native build exists yet; run without `--ios` flag or check that `ios/Pods` is populated. |
| Simulator shows home screen after launch | App didn't open. Run `xcrun simctl launch booted com.anonymous.mobile`. |
| Build fails at Xcode step | Run `cd ios && pod install` to refresh Pods, then retry. |

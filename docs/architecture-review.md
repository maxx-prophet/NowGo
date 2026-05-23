# NowGo — Senior Solutions Engineering Review

*Reviewed: 2026-05-21*

---

## Executive Summary

The core architecture decisions are **sound** — PostgreSQL with PostGIS is the right database for geo-radius queries, Express is a reasonable API layer, and Expo bare workflow is the correct choice for a production React Native app with native modules. The MVP shape is coherent.

However, there are **five issues that range from crash-inducing to architecturally problematic**, and about a dozen practices that will create real pain at scale. The iOS crash is very likely not a "random crash" — it almost certainly has a traceable root cause in the stack version choices.

---

## 1. The iOS Crash — Most Probable Root Causes

**Most likely culprit: React Native 0.81.5 + New Architecture**

React Native 0.76+ enables the **New Architecture** (Fabric renderer + JSI) by default. This is a breaking change for any native module that hasn't been updated to support it. When an incompatible native module loads, the app crashes at startup before any JS executes — which matches the symptom.

```bash
cd ~/Desktop/NowGo/mobile/ios
cat Podfile | grep newArchEnabled
# If true (or absent, defaulting to true), New Architecture is on
```

```bash
cat Podfile.lock | grep -E "RNScreens|react-native-safe-area"
# Confirm Pod versions match expectations
```

**Second most likely: Missing `NSLocationWhenInUseUsageDescription`**

`expo-location` calls `CLLocationManager.requestWhenInUseAuthorization()` at startup (`TonightFeed.js:22`). On iOS 14+, if the `NSLocationWhenInUseUsageDescription` key is absent from `Info.plist`, the app **terminates immediately** — no JS error, no visible crash screen.

```bash
grep -r "NSLocationWhenInUseUsage" ~/Desktop/NowGo/mobile/ios/mobile/Info.plist
# Should return a non-empty line. If nothing: this is your crash.
```

**Third: React 19 is bleeding edge for React Native**

React 19.1.0 with RN 0.81.5 is a very new combination. Hermes may have bundling incompatibilities with React 19 concurrent features.

---

## 2. Critical Bugs

**Port mismatch — `mobile/src/api/nowgo.js:3`**
```js
const API_BASE = "http://localhost:4000";  // server runs on :3000
```
Every API call fails silently at the network layer. If an unhandled promise rejection bubbles up from `fetchTonightEvents`, React Native's default error handler can terminate the app. Fix before anything else.

**`TonightFeed.js` — location triggers infinite re-fetch risk**
```js
const load = useCallback(async (...) => { ... }, [location, segment, mode]);
useEffect(() => { load(); }, [load]);
```
`expo-location` returns a new coordinates object on every GPS update. Each new `location` object creates a new `load` function (even if lat/lng didn't change), which triggers `useEffect`, which fires another API call. On a real device with active GPS this produces dozens of requests per minute. Fix by depending on primitive values instead of the object:
```js
}, [location?.latitude, location?.longitude, segment, mode]);
```

---

## 3. Architecture — What's Sound

- **PostGIS for geo queries** — correct tool. `ST_DWithin` with a geography type properly handles spherical math. The query structure in `server.js:68-108` is well-written.
- **Upsert pattern** — `ON CONFLICT DO UPDATE` in both `upsertVenue` and `upsertEvent` is the right approach for idempotent ingestion.
- **Provider cascade in `travel.js`** — the fallback chain (Google → Mapbox → distance estimate) is defensive and correct. The haversine fallback ensures travel time always returns something.
- **Expo bare workflow** — the right choice. Expo Go won't support `expo-location` with the permissions entitlements needed in production.
- **React Navigation v7 native stack** — correct. Always use native stack over JS stack for iOS. JS stack has noticeable animation jank.

---

## 4. Architecture — What Needs Fixing

### 4a. Travel time enrichment is N external API calls per user request

`server.js:114` runs `Promise.all(rows.map(event => getTravelTime(...)))`. With the default limit of 50 events, one user request fires **50 parallel calls** to Google Distance Matrix or Mapbox. At scale this is expensive (Google charges per element), slow (response time = max of 50 API calls), and fragile.

**Recommendation:** Pre-compute travel time during ingestion using the distance-estimate fallback (no external API). For real-time travel time when the user has a location, compute it client-side for the top 10 nearest events only, or use a separate `GET /events/:id/travel` endpoint.

### 4b. Scheduler uses shell exec to call fetchers

`scheduler.js:14-20` runs fetchers as subprocesses via `execAsync("node src/fetchers/ticketmaster.js")`. This spawns a new Node.js process per fetcher, loses structured error information, and can't share database connections or config across steps.

**Recommendation:** Export a `run()` function from each fetcher and import them in the scheduler:
```js
import { run as runTicketmaster } from "./fetchers/ticketmaster.js";
await runTicketmaster();
```

### 4c. JSON file intermediary in the pipeline

The pipeline writes events to `data/events-tonight*.json`, then `ingest.js` reads whichever file is most recently modified. This introduces race conditions (two overlapping runs pick the wrong file), unnecessary disk I/O, and ambiguity about which data is current.

**Recommendation:** Fetchers should write directly to the database, or pass event arrays in memory through the pipeline. Keep JSON files for debugging only, not as the coupling mechanism between pipeline stages.

### 4d. Venue deduplication by name is fragile

`ingest.js:14` upserts venues with `ON CONFLICT (name)`. "Jazz Standard" and "Jazz Standard NYC" become two separate venues. Real-world API data has inconsistent venue naming — duplicate venues will accumulate immediately.

**Recommendation:** Deduplicate venues on geocoordinate proximity (venues within 50 meters are the same venue), with name as a secondary signal. Store a `canonical_name` field and match on that.

### 4e. No migration versioning

`db/migrate.js` runs `001_initial_schema.sql` every time with no tracking of which migrations have run. As the schema evolves, re-running the migration file is unsafe unless it's fully idempotent.

**Recommendation:** Add a `schema_migrations` table that records applied migrations by filename and checksum. Consider `node-pg-migrate` or `db-migrate` — both are lightweight and Node-native.

---

## 5. Missing Practices

| Area | Gap | Impact |
|---|---|---|
| **Authentication** | No API key, JWT, or rate limiting on any endpoint | Anyone who discovers the URL can trigger `/pipeline/run` or scrape all event data |
| **API versioning** | No `/v1/` prefix | First breaking API change requires coordinated mobile app release |
| **Input validation** | `lat`/`lng` not range-validated (lat must be ±90, lng ±180) | Malformed requests reach the SQL query |
| **TypeScript** | No type safety anywhere | Untyped API responses across RN ↔ Express ↔ PostgreSQL cause runtime errors that TS catches at build time |
| **Error boundary** | No React error boundary | A JS exception anywhere crashes the entire app |
| **Offline caching** | Network failure = empty screen | Cache last successful response in `AsyncStorage`, show stale data with a banner |
| **ATS for physical device** | `http://localhost` works in simulator; blocked on a real device by iOS App Transport Security | Add `NSAppTransportSecurity` exception for dev server domain before testing on a device |
| **Availability snapshots** | Every upsert inserts a snapshot row regardless of whether anything changed | Add a `WHERE` clause that only inserts when `availability_tier` or price has changed — otherwise this table grows unbounded |

---

## 6. iOS-Specific Recommendations

1. **Always open `.xcworkspace`, never `.xcodeproj`** — opening `.xcodeproj` bypasses CocoaPods and produces mysterious linker errors.

2. **Keep a clean simulator** — stale derived data causes ghost crashes. When a crash has no obvious cause: `rm -rf ~/Library/Developer/Xcode/DerivedData` then rebuild.

3. **Check Xcode Organizer, not just the console** — Xcode → Window → Organizer → Crashes gives symbolicated crash reports with the exact line in native code. Console logs are too noisy.

4. **`expo-location` requires two `Info.plist` keys** — `NSLocationWhenInUseUsageDescription` AND `NSLocationAlwaysAndWhenInUseUsageDescription` if background location is ever requested. Missing the first causes an immediate crash.

5. **Hermes is enabled by default in RN 0.76+** — don't fight it. Hermes produces better crash symbolication than JSC and is faster on iOS. Ensure the Hermes-compatible build of React 19 is in use.

6. **`expo-location` in a bare workflow** — after `pod install`, verify the pod is listed: `cat mobile/ios/Podfile.lock | grep ExpoLocation`. If missing, run `npx expo prebuild --clean` to regenerate the native project.

---

## Priority Action List

| Priority | Action |
|---|---|
| P0 | Check `Info.plist` for `NSLocationWhenInUseUsageDescription` — likely crash cause |
| P0 | Fix `API_BASE` port `4000 → 3000` in `mobile/src/api/nowgo.js` |
| P0 | Run `pod install` in `mobile/ios/`, then clean build |
| P1 | Fix `useCallback` deps in `TonightFeed.js` to use primitive `lat`/`lng` values |
| P1 | Move travel time enrichment out of the per-request path |
| P1 | Add `ErrorBoundary` in `App.js` |
| P2 | Refactor scheduler to import fetchers as modules instead of spawning subprocesses |
| P2 | Add API versioning prefix (`/v1/`) |
| P2 | Add migration versioning (`node-pg-migrate` or similar) |
| P3 | Add TypeScript incrementally — start with the API client and data models |
| P3 | Add offline caching with `AsyncStorage` |

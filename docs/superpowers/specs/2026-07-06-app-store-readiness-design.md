# NowGo — App Store Readiness Design

**Date:** 2026-07-06  
**Scope:** iOS first  
**Approach:** Full pre-launch hardening (blockers + safety net + architecture)

---

## Context

NowGo is an Expo 54 / React Native 0.81.5 app for discovering NYC events tonight. The business plan for the week of 2026-07-06 is to file the LLC and apply for an Apple Developer account. This spec covers everything that must be done before submitting to the App Store.

The codebase is a clean, focused MVP: onboarding flow (5 screens), a TonightFeed main screen, EventDetail, and a filters modal. Analytics via PostHog, backend on Railway, build system via EAS.

---

## Section 1 — App Store Blockers

### 1.1 Add `expo-location` to plugins

**File:** `app.config.js`

`expo-localization` is in the plugins array but `expo-location` is not. The `expo-location` plugin is responsible for injecting `NSLocationWhenInUseUsageDescription` into `Info.plist`. Without it, the iOS build will either be rejected at review or crash when requesting location permission.

**Fix:** Add to plugins array:
```js
plugins: [
  "expo-localization",
  [
    "expo-location",
    {
      locationWhenInUsePermission: "NowGo uses your location to show events near you and estimate travel time."
    }
  ]
]
```

### 1.2 Add Privacy Manifest (PrivacyInfo.xcprivacy)

Apple has required a privacy manifest since May 2024 for any app that uses location APIs or third-party SDKs that access user data. PostHog and `expo-location` both qualify. Without this file, App Store Connect will flag the build during processing.

**Fix:** Since this is a managed workflow project (no `/ios` directory committed), the manifest must be injected via a custom Expo config plugin. Create `plugins/withPrivacyManifest.js` that uses `withInfoPlist` / `withDangerousMod` to write `PrivacyInfo.xcprivacy` into the generated iOS project during `expo prebuild` / EAS build. Register it in `app.config.js` plugins array.

The manifest must declare:
- `NSPrivacyAccessedAPITypes` — location API usage reason (`NSPrivacyAccessedAPICategoryLocationInUse`)
- `NSPrivacyCollectedDataTypes` — location data collected, linked to usage only, not to identity
- `NSPrivacyTracking: false` — NowGo does not engage in cross-app tracking

Reference: [Expo privacy manifest guide](https://docs.expo.dev/guides/apple-privacy/)

### 1.3 Add `ios.buildNumber` to app.config.js

**File:** `app.config.js`

App Store Connect requires a build number. Currently only `version: "1.0.0"` is set with no `buildNumber`. EAS will auto-increment it during builds, but it must be seeded explicitly.

**Fix:**
```js
ios: {
  supportsTablet: false,
  bundleIdentifier: "com.nowgo.app",
  buildNumber: "1",
  infoPlist: {
    ITSAppUsesNonExemptEncryption: false,
  },
},
```

### 1.4 Age Rating Decision

The app surfaces Nightlife events. Apple requires a self-rating during submission. Options:

- **12+** — Appropriate if nightlife content is venue listings only (no explicit themes, alcohol promotion, etc.). Broader discoverability.
- **17+** — Required if the content is deemed mature. Restricts discoverability significantly.

**Recommendation:** Rate 12+. The app shows event listings (venue, time, price, travel info) — no explicit content. Nightlife as a category (clubs, bars) is present but the app does not promote alcohol or adult content directly. Note this rationale when completing the content rating questionnaire in App Store Connect.

### 1.5 Privacy Policy URL

App Store Connect requires a hosted privacy policy URL before submission. This is a legal/business task, not a code task — but it hard-blocks submission. Must be in place before the App Store Connect listing is submitted.

**Action:** Draft and host a privacy policy that covers: location data collection (used for event proximity, not stored server-side), analytics via PostHog (usage data, no advertising), and no sale of user data.

---

## Section 2 — Safety Net

### 2.1 React Error Boundary

**File to create:** `src/components/ErrorBoundary.tsx`  
**File to modify:** `App.tsx`

React Native does not add an error boundary automatically. Any unhandled render error produces a blank white screen with no recovery path. A reviewer hitting this during App Store review is an immediate rejection.

The `ErrorBoundary` component wraps `AppContent` in `App.tsx` and catches any render-phase JS error, displaying a "Something went wrong — tap to restart" screen. It uses `React.Component` class syntax (required for `componentDidCatch`).

**Interface:**
```tsx
<ErrorBoundary>
  <AppContent />
</ErrorBoundary>
```

The fallback UI should match the app's dark theme (`#0A0A0A` background, white text, orange CTA) and call `Updates.reloadAsync()` or `RN.DevSettings.reload()` on tap to restart the app.

### 2.2 Location Permission Recovery

**File to modify:** `src/hooks/useLocation.ts` (new — see Section 3.3)

Currently, if a user denies location permission on first launch, the app silently uses NYC-wide results. There is no way for the user to later grant location without going to iOS Settings manually. The feed's empty/fallback state should show a subtle "Enable location for nearby events" nudge that calls `Linking.openURL('app-settings:')`.

The nudge appears only when:
- Location permission status is `denied` (not `undetermined` — we don't re-prompt)
- The events list loaded successfully but no location coords were available

This is a one-line deep-link call, surfaced in the existing empty/error state UI in `TonightFeed.tsx`.

---

## Section 3 — Architecture Refactoring

### 3.1 Split TonightFeed.tsx

**Current state:** 680 lines. Owns filter state, surprise-me state, location logic, two inline modals, and the main FlatList.

**Target state:**

| File | Responsibility |
|------|---------------|
| `src/screens/TonightFeed.tsx` | Main screen: orchestrates state, renders list and control rows |
| `src/components/FilterSheet.tsx` | Bottom sheet modal: sort and walk-ins draft state, commit on "Show results" |
| `src/components/SurpriseSheet.tsx` | "Tonight's Pick" modal: surprise events pagination |

**FilterSheet** is a natural extraction — it already has isolated draft state (`draftSortBy`, `draftWalkInsOnly`) and a single commit point. It receives current values as props and calls an `onApply(sortBy, walkInsOnly)` callback.

**SurpriseSheet** receives `events`, `loading`, `mode`, `location`, and `onNavigate` as props. It owns only the `surpriseIndex` state.

`TonightFeed` shrinks to ~250 lines: data fetching, filter state, location, and rendering the list + control rows.

### 3.2 Type the Navigation Stack

**File to modify:** `src/types/index.ts`, `App.tsx`, all screen files

All screens currently use `NativeStackNavigationProp<any>`. This gives up type safety on route names and params entirely.

**Fix:** Add a `RootStackParamList` to `src/types/index.ts`:

```ts
export type RootStackParamList = {
  TonightFeed: undefined;
  EventDetail: {
    event: Event;
    userLat: number | null;
    userLng: number | null;
    initialMode: "transit" | "walk" | "drive";
  };
  Filters: undefined;
};

export type OnboardingStackParamList = {
  Welcome: undefined;
  Identity: undefined;
  Vibe: undefined;
  Budget: undefined;
  Ready: undefined;
};
```

Then update each screen to use `NativeStackNavigationProp<RootStackParamList, "ScreenName">` and `RouteProp<RootStackParamList, "ScreenName">`. The navigator in `App.tsx` gets typed with `createNativeStackNavigator<RootStackParamList>()`.

### 3.3 Extract `useLocation` Hook

**File to create:** `src/hooks/useLocation.ts`

Location permission request logic currently sits inline in `TonightFeed.tsx`. Extracting it:

1. Centralizes the permission + recovery logic (Section 2.2 nudge lives here)
2. Makes location available to other screens without prop-drilling
3. Returns `{ coords, permissionStatus }` so callers can branch on denied state

**Interface:**
```ts
function useLocation(): {
  coords: LocationObjectCoords | null;
  permissionStatus: "granted" | "denied" | "undetermined";
}
```

---

## What Is Not In Scope

- Android support (package name, Play Store config) — deferred until iOS launch
- Push notifications — no notification infrastructure exists; deferred
- Settings screen ("Change this anytime in settings" copy exists on ReadyScreen but no settings screen) — deferred
- Backend changes — this spec covers the mobile client only
- TonightFeed filter state persistence across sessions — not a blocker

---

## Implementation Order

1. App Store blockers (Section 1) — must be done before EAS production build
2. Error boundary (Section 2.1) — fast, high-value, do alongside blockers
3. useLocation hook + permission recovery nudge (Section 2.2 + 3.3) — do together
4. Navigation types (Section 3.2) — mechanical, do as a single pass
5. FilterSheet + SurpriseSheet extraction (Section 3.1) — do last; biggest change, lowest risk since it's purely structural

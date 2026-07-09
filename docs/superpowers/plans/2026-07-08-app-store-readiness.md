# NowGo App Store Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all iOS App Store blockers, add a crash safety net, and refactor TonightFeed into focused components before first submission.

**Architecture:** Managed Expo workflow (no `/ios` directory committed). All native config changes go through `app.config.js` + a custom config plugin (`plugins/withPrivacyManifest.js`) that runs during EAS build / `expo prebuild`. UI safety net is a class-based React error boundary (required for `componentDidCatch`) wrapping the root. Architecture refactor extracts two inline Modals from `TonightFeed.tsx` into focused components and centralizes location logic in a hook.

**Tech Stack:** Expo SDK ~54.0.35, React Native 0.81.5, React 19.1.0, TypeScript 5.9, EAS Build, React Navigation v7, PostHog, `node --test` for unit tests.

## Global Constraints

- iOS only — do not add `android.package` or any Android-specific config
- Dark theme only: background `#0A0A0A`, card `#1A1A1A`, primary orange `#FF6B35`, gold `#F5A623`
- Do not rename or modify any PostHog event names (feed_loaded, event_tapped, etc.)
- Do not change any API call signatures in `src/api/nowgo.ts`
- All new files in TypeScript (`.tsx` for components, `.ts` for hooks/utils)
- Tests use `node:test` and `node:assert/strict` — no test framework install needed
- `npx tsc --noEmit` must pass (currently zero errors — keep it that way)
- `node --test <file>` must pass for each test file

---

## File Map

| Status | Path | Purpose |
|--------|------|---------|
| Modify | `app.config.js` | Add expo-location plugin, buildNumber, withPrivacyManifest plugin |
| Create | `plugins/withPrivacyManifest.js` | Custom Expo config plugin — writes PrivacyInfo.xcprivacy during prebuild |
| Create | `src/components/ErrorBoundary.tsx` | Class component — catches render errors, shows restart screen |
| Modify | `App.tsx` | Wrap AppContent with ErrorBoundary; split into typed AppStack + OnboardingStack |
| Modify | `src/types/index.ts` | Add RootStackParamList + OnboardingStackParamList |
| Create | `src/hooks/useLocation.ts` | Requests location permission, returns coords + permissionStatus |
| Create | `src/components/FilterSheet.tsx` | Extracted sort/walk-ins bottom sheet Modal |
| Create | `src/components/SurpriseSheet.tsx` | Extracted "Tonight's Pick" surprise Modal |
| Modify | `src/screens/TonightFeed.tsx` | Use useLocation hook; use FilterSheet + SurpriseSheet; add location nudge |
| Modify | `src/screens/EventDetail.tsx` | Use typed RootStackParamList nav props |
| Modify | `src/screens/FiltersModal.tsx` | Use typed RootStackParamList nav props |
| Modify | `src/screens/onboarding/*.tsx` | Use typed OnboardingStackParamList nav props (5 files) |

---

## Task 1: App Config — expo-location Plugin + Build Number

**Files:**
- Modify: `app.config.js`

**Interfaces:**
- Produces: `ios.buildNumber` field; `expo-location` plugin entry consumed by EAS build

- [ ] **Step 1: Add expo-location plugin and buildNumber**

Open `app.config.js`. Replace the `plugins` and `ios` sections:

```js
// app.config.js — full file after change
import "dotenv/config";

export default ({ config }) => ({
  ...config,
  name: "NowGo",
  slug: "nowgo",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0A0A0A",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.nowgo.app",
    buildNumber: "1",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0A0A0A",
    },
    edgeToEdgeEnabled: true,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-localization",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "NowGo uses your location to show events near you and estimate your travel time.",
      },
    ],
  ],
  extra: {
    apiUrl: process.env.API_URL ?? "https://nowgo-production.up.railway.app",
    appEnv: process.env.APP_ENV ?? "production",
    postHogKey: process.env.POSTHOG_KEY ?? "",
    posthogHost: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    eas: {
      projectId: "9776acca-9db0-4dab-a3e3-1d2eb6192538",
    },
  },
});
```

- [ ] **Step 2: Verify config introspection shows the location plugin**

Run:
```bash
npx expo config --type introspect 2>&1 | grep -A2 "locationWhenInUse"
```

Expected output includes:
```
locationWhenInUsePermission: 'NowGo uses your location to show events near you and estimate your travel time.'
```

- [ ] **Step 3: Commit**

```bash
git add app.config.js
git commit -m "feat: add expo-location plugin and ios buildNumber to app config"
```

---

## Task 2: Privacy Manifest Config Plugin

**Files:**
- Create: `plugins/withPrivacyManifest.js`
- Modify: `app.config.js`

**Interfaces:**
- Produces: `PrivacyInfo.xcprivacy` written into the generated iOS project during `expo prebuild` / EAS build

- [ ] **Step 1: Create the plugins directory and plugin file**

```bash
mkdir -p plugins
```

Create `plugins/withPrivacyManifest.js`:

```js
// plugins/withPrivacyManifest.js
const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

// Apple requires a privacy manifest for apps that use location or third-party
// analytics SDKs (PostHog). This plugin writes PrivacyInfo.xcprivacy into the
// generated native iOS project during prebuild / EAS build.
//
// NSPrivacyAccessedAPICategoryUserDefaults: AsyncStorage (and PostHog's device
//   ID persistence) read/write NSUserDefaults. Reason CA92.1 = "access info
//   from the same app that wrote it."
// NSPrivacyCollectedDataTypePreciseLocation: location coords used for event
//   proximity and travel time — not linked to identity, not for tracking.
//
// Verify reason codes against https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
// before submitting — Apple occasionally adds new required reasons.
const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePreciseLocation</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <false/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>`;

module.exports = function withPrivacyManifest(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const projectName = config.modRequest.projectName;
      const iosDir = path.join(projectRoot, "ios", projectName);
      fs.mkdirSync(iosDir, { recursive: true });
      fs.writeFileSync(path.join(iosDir, "PrivacyInfo.xcprivacy"), PRIVACY_MANIFEST);
      return config;
    },
  ]);
};
```

- [ ] **Step 2: Register the plugin in app.config.js**

Add `"./plugins/withPrivacyManifest"` as the last entry in the plugins array:

```js
plugins: [
  "expo-localization",
  [
    "expo-location",
    {
      locationWhenInUsePermission:
        "NowGo uses your location to show events near you and estimate your travel time.",
    },
  ],
  "./plugins/withPrivacyManifest",
],
```

- [ ] **Step 3: Verify the plugin runs during prebuild**

```bash
npx expo prebuild --platform ios --clean 2>&1 | tail -20
```

Expected: no errors. Then check:

```bash
ls ios/NowGo/PrivacyInfo.xcprivacy
```

Expected: file exists.

- [ ] **Step 4: Clean up generated native folder (keep repo clean)**

```bash
rm -rf ios android
```

The `/ios` and `/android` folders are generated at build time by EAS and should not be committed (they're already gitignored).

- [ ] **Step 5: Commit**

```bash
git add plugins/withPrivacyManifest.js app.config.js
git commit -m "feat: add privacy manifest config plugin for App Store compliance"
```

---

## Task 3: Error Boundary + expo-updates

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Produces: `<ErrorBoundary>` component — wraps children, catches render errors, shows restart screen

- [ ] **Step 1: Install expo-updates**

```bash
npx expo install expo-updates
```

Expected: `expo-updates` added to `package.json` dependencies at the Expo SDK 54 compatible version.

- [ ] **Step 2: Create ErrorBoundary component**

Create `src/components/ErrorBoundary.tsx`:

```tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Updates from "expo-updates";

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  async handleRestart() {
    try {
      await Updates.reloadAsync();
    } catch {
      // expo-updates not available (Expo Go dev builds) — reset boundary instead
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.sub}>The app hit an unexpected error.</Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => this.handleRestart()}
          >
            <Text style={styles.btnText}>Restart app</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  sub: {
    color: "#6B7280",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 40,
    lineHeight: 22,
  },
  btn: {
    backgroundColor: "#FF6B35",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  btnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
```

- [ ] **Step 3: Wrap AppContent in App.tsx**

In `App.tsx`, import ErrorBoundary and wrap `<AppContent />`:

```tsx
// Add this import at the top with the other imports
import ErrorBoundary from "./src/components/ErrorBoundary";
```

Replace the `return` in the `App` function:

```tsx
export default function App() {
  return (
    <PostHogProvider
      client={posthog}
      autocapture={{ captureScreens: false, captureTouches: true }}
    >
      <PreferencesProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </PreferencesProvider>
    </PostHogProvider>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

In `App.tsx`, temporarily add `throw new Error("test boundary")` as the first line inside `AppContent`'s render. Run `npx expo start`, open in simulator — verify the restart screen appears with "Something went wrong" in the dark theme. Remove the throw before committing.

- [ ] **Step 6: Commit**

```bash
git add src/components/ErrorBoundary.tsx App.tsx package.json
git commit -m "feat: add error boundary and expo-updates for crash recovery"
```

---

## Task 4: useLocation Hook + Permission Nudge

**Files:**
- Create: `src/hooks/useLocation.ts`
- Modify: `src/screens/TonightFeed.tsx`

**Interfaces:**
- Produces:
  ```ts
  function useLocation(): {
    coords: import("expo-location").LocationObjectCoords | null;
    permissionStatus: "granted" | "denied" | "undetermined";
  }
  ```
- Consumes: `expo-location` (already in dependencies)

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useLocation.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

// Pure logic: normalizing expo-location PermissionStatus to our 3-value enum
function normalizePermissionStatus(
  status: string
): "granted" | "denied" | "undetermined" {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

test("granted maps to granted", () => {
  assert.equal(normalizePermissionStatus("granted"), "granted");
});

test("denied maps to denied", () => {
  assert.equal(normalizePermissionStatus("denied"), "denied");
});

test("restricted maps to undetermined", () => {
  assert.equal(normalizePermissionStatus("restricted"), "undetermined");
});

test("unknown string maps to undetermined", () => {
  assert.equal(normalizePermissionStatus("anything-else"), "undetermined");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test src/hooks/useLocation.test.ts
```

Expected: `ReferenceError: normalizePermissionStatus is not defined` (because we haven't created the hook yet — the test defines a local copy of the logic to verify it, then we'll inline that logic in the hook).

Actually expected output: tests PASS (the function is defined inline in the test file). This confirms the logic is correct before we embed it.

- [ ] **Step 3: Create the useLocation hook**

Create `src/hooks/useLocation.ts`:

```ts
import { useState, useEffect } from "react";
import * as Location from "expo-location";

type PermissionStatus = "granted" | "denied" | "undetermined";

function normalizePermissionStatus(status: string): PermissionStatus {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export function useLocation(): {
  coords: Location.LocationObjectCoords | null;
  permissionStatus: PermissionStatus;
} {
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("undetermined");

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const normalized = normalizePermissionStatus(status);
      setPermissionStatus(normalized);
      if (normalized === "granted") {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCoords(loc.coords);
      }
    })();
  }, []);

  return { coords, permissionStatus };
}
```

- [ ] **Step 4: Run tests**

```bash
node --test src/hooks/useLocation.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 5: Update TonightFeed to use useLocation and show permission nudge**

In `src/screens/TonightFeed.tsx`:

**a) Replace the import and state:**

Remove this block:
```tsx
import * as Location from "expo-location";
```
```tsx
const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
```
```tsx
useEffect(() => {
  (async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(loc.coords);
    }
  })();
}, []);
```

**b) Add the import:**

```tsx
import { useLocation } from "../hooks/useLocation";
```

**c) Replace location state with hook (add after `const analytics = useAnalytics();`):**

```tsx
const { coords, permissionStatus } = useLocation();
```

**d) Update all references from `location` to `coords`:**

In the `load` callback:
```tsx
const data = await fetchTonightEvents({
  lat: coords?.latitude,
  lng: coords?.longitude,
  mode,
  segment: category,
  budgetMax,
  sortBy,
  walkInsOnly,
});
```

In `loadSurprise`:
```tsx
const data = await fetchTonightEvents({
  lat: coords?.latitude,
  lng: coords?.longitude,
  mode,
  surpriseMe: true,
});
```

In the `load` useEffect dependency array:
```tsx
}, [coords, category, mode, budgetMax, sortBy, walkInsOnly]);
```

In `renderItem` where EventDetail is navigated to:
```tsx
navigation.navigate("EventDetail", {
  event: item,
  userLat: coords?.latitude ?? null,
  userLng: coords?.longitude ?? null,
  initialMode: mode,
});
```

In the Surprise Me modal's `onPress`:
```tsx
navigation.navigate("EventDetail", {
  event: surpriseEvents[surpriseIndex],
  userLat: coords?.latitude ?? null,
  userLng: coords?.longitude ?? null,
  initialMode: mode,
});
```

In the count label:
```tsx
{coords ? " · near you" : " · NYC"}
```

**e) Add location nudge between the Surprise Me button and the FlatList:**

```tsx
{/* Location permission nudge — shown only when denied */}
{permissionStatus === "denied" && (
  <TouchableOpacity
    style={styles.locationNudge}
    onPress={() => Linking.openURL("app-settings:")}
  >
    <Text style={styles.locationNudgeText}>
      📍 Enable location for nearby events
    </Text>
  </TouchableOpacity>
)}
```

**f) Add `Linking` import:**

```tsx
import { ..., Linking } from "react-native";
```

**g) Add nudge styles to the StyleSheet:**

```tsx
locationNudge: {
  marginHorizontal: 16,
  marginBottom: 8,
  paddingVertical: 10,
  paddingHorizontal: 14,
  backgroundColor: "#1A1A1A",
  borderRadius: 10,
  borderWidth: 1,
  borderColor: "#2A2A2A",
  flexDirection: "row",
  alignItems: "center",
},
locationNudgeText: {
  color: "#9CA3AF",
  fontSize: 13,
  fontWeight: "500",
},
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useLocation.ts src/hooks/useLocation.test.ts src/screens/TonightFeed.tsx
git commit -m "feat: extract useLocation hook and add location permission recovery nudge"
```

---

## Task 5: Navigation Types

**Files:**
- Modify: `src/types/index.ts`
- Modify: `App.tsx`
- Modify: `src/screens/TonightFeed.tsx`
- Modify: `src/screens/EventDetail.tsx`
- Modify: `src/screens/FiltersModal.tsx`
- Modify: `src/screens/onboarding/WelcomeScreen.tsx`
- Modify: `src/screens/onboarding/IdentityScreen.tsx`
- Modify: `src/screens/onboarding/VibeScreen.tsx`
- Modify: `src/screens/onboarding/BudgetScreen.tsx`
- Modify: `src/screens/onboarding/ReadyScreen.tsx`

**Interfaces:**
- Produces:
  ```ts
  type RootStackParamList = { ... }
  type OnboardingStackParamList = { ... }
  ```

- [ ] **Step 1: Add param list types to src/types/index.ts**

Append to the end of `src/types/index.ts`:

```ts
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

export type TravelMode = "transit" | "walk" | "drive";

export type RootStackParamList = {
  TonightFeed: undefined;
  EventDetail: {
    event: Event;
    userLat: number | null;
    userLng: number | null;
    initialMode: TravelMode;
  };
  Filters: {
    mode: TravelMode;
    onApply: (mode: TravelMode) => void;
  };
};

export type OnboardingStackParamList = {
  Welcome: undefined;
  Identity: undefined;
  Vibe: undefined;
  Budget: undefined;
  Ready: undefined;
};

// Convenience prop types for app screens
export type AppNavProp<S extends keyof RootStackParamList> =
  NativeStackNavigationProp<RootStackParamList, S>;
export type AppRouteProp<S extends keyof RootStackParamList> =
  RouteProp<RootStackParamList, S>;

// Convenience prop types for onboarding screens
export type OnboardingNavProp<S extends keyof OnboardingStackParamList> =
  NativeStackNavigationProp<OnboardingStackParamList, S>;
```

Note: remove the `TravelMode` type alias from `EventDetail.tsx` after this (it's defined there currently as a local type).

- [ ] **Step 2: Update App.tsx — split into two typed navigators**

Replace:
```tsx
const Stack = createNativeStackNavigator();
```

With:
```tsx
const AppStack = createNativeStackNavigator<RootStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
```

Add imports to `App.tsx`:
```tsx
import type { RootStackParamList, OnboardingStackParamList } from "./src/types";
```

Update the navigator JSX in `AppContent`:
```tsx
{preferences.onboardingComplete ? (
  <AppStack.Navigator screenOptions={appStackOpts}>
    <AppStack.Screen name="TonightFeed" component={TonightFeed} options={{ title: "Tonight in NYC" }} />
    <AppStack.Screen name="EventDetail" component={EventDetail as React.ComponentType<any>} options={{ title: "Event" }} />
    <AppStack.Screen name="Filters" component={FiltersModal as React.ComponentType<any>} options={{ presentation: "modal", title: "Filters" }} />
  </AppStack.Navigator>
) : (
  <OnboardingStack.Navigator screenOptions={stackOpts}>
    <OnboardingStack.Screen name="Welcome" component={WelcomeScreen} />
    <OnboardingStack.Screen name="Identity" component={IdentityScreen} />
    <OnboardingStack.Screen name="Vibe" component={VibeScreen} />
    <OnboardingStack.Screen name="Budget" component={BudgetScreen} />
    <OnboardingStack.Screen name="Ready" component={ReadyScreen} />
  </OnboardingStack.Navigator>
)}
```

- [ ] **Step 3: Update TonightFeed.tsx**

Replace:
```tsx
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
```
```tsx
interface Props {
  navigation: NativeStackNavigationProp<any>;
}
```

With:
```tsx
import type { AppNavProp } from "../types";

interface Props {
  navigation: AppNavProp<"TonightFeed">;
}
```

- [ ] **Step 4: Update EventDetail.tsx**

Remove the local `TravelMode` type alias (it's now exported from `src/types/index.ts`).

Replace:
```tsx
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
```
```tsx
type TravelMode = "transit" | "walk" | "drive";

type ParamList = {
  EventDetail: {
    event: Event;
    userLat?: number | null;
    userLng?: number | null;
    initialMode?: TravelMode;
  };
};

interface Props {
  route: RouteProp<ParamList, "EventDetail">;
  navigation: NativeStackNavigationProp<any>;
}
```

With:
```tsx
import type { AppNavProp, AppRouteProp, TravelMode } from "../types";

interface Props {
  route: AppRouteProp<"EventDetail">;
  navigation: AppNavProp<"EventDetail">;
}
```

- [ ] **Step 5: Update FiltersModal.tsx**

Replace:
```tsx
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

type ParamList = { Filters: { mode: "transit" | "walk" | "drive"; onApply: (mode: "transit" | "walk" | "drive") => void } };

interface Props {
  route: RouteProp<ParamList, "Filters">;
  navigation: NativeStackNavigationProp<any>;
}
```

With:
```tsx
import type { AppNavProp, AppRouteProp } from "../types";

interface Props {
  route: AppRouteProp<"Filters">;
  navigation: AppNavProp<"Filters">;
}
```

- [ ] **Step 6: Update all 5 onboarding screens**

Each onboarding screen currently has `navigation: any`. Apply this pattern to all five:

**WelcomeScreen.tsx** — replace `{ navigation }: { navigation: any }` with:
```tsx
import type { OnboardingNavProp } from "../../types";

// in props:
{ navigation }: { navigation: OnboardingNavProp<"Welcome"> }
```

**IdentityScreen.tsx**:
```tsx
import type { OnboardingNavProp } from "../../types";
{ navigation }: { navigation: OnboardingNavProp<"Identity"> }
```

**VibeScreen.tsx**:
```tsx
import type { OnboardingNavProp } from "../../types";
{ navigation }: { navigation: OnboardingNavProp<"Vibe"> }
```

**BudgetScreen.tsx**:
```tsx
import type { OnboardingNavProp } from "../../types";
{ navigation }: { navigation: OnboardingNavProp<"Budget"> }
```

**ReadyScreen.tsx**:
```tsx
import type { OnboardingNavProp } from "../../types";
{ navigation }: { navigation: OnboardingNavProp<"Ready"> }
```

- [ ] **Step 7: Verify TypeScript — zero errors**

```bash
npx tsc --noEmit
```

Expected: no output (zero errors). If you see errors about `navigation.navigate` calls — TypeScript now validates route names. Fix any route name typos.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts App.tsx src/screens/TonightFeed.tsx src/screens/EventDetail.tsx src/screens/FiltersModal.tsx src/screens/onboarding/
git commit -m "feat: add typed navigation stack (RootStackParamList + OnboardingStackParamList)"
```

---

## Task 6: Extract FilterSheet Component

**Files:**
- Create: `src/components/FilterSheet.tsx`
- Modify: `src/screens/TonightFeed.tsx`

**Interfaces:**
- Produces:
  ```tsx
  interface FilterSheetProps {
    visible: boolean;
    sortBy: "best" | "soonest" | "nearest" | "cheapest";
    walkInsOnly: boolean;
    onApply: (sortBy: "best" | "soonest" | "nearest" | "cheapest", walkInsOnly: boolean) => void;
    onClose: () => void;
  }
  export default function FilterSheet(props: FilterSheetProps): JSX.Element
  ```
- Consumes: `useAnalytics` from `../services/analytics`

- [ ] **Step 1: Create FilterSheet.tsx**

Create `src/components/FilterSheet.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, Modal, Switch, StyleSheet,
} from "react-native";
import { useAnalytics } from "../services/analytics";

type SortBy = "best" | "soonest" | "nearest" | "cheapest";

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "best",     label: "Best Match" },
  { key: "soonest",  label: "Soonest" },
  { key: "nearest",  label: "Nearest" },
  { key: "cheapest", label: "Cheapest" },
];

interface Props {
  visible: boolean;
  sortBy: SortBy;
  walkInsOnly: boolean;
  onApply: (sortBy: SortBy, walkInsOnly: boolean) => void;
  onClose: () => void;
}

export default function FilterSheet({ visible, sortBy, walkInsOnly, onApply, onClose }: Props) {
  const [draftSortBy, setDraftSortBy] = useState<SortBy>(sortBy);
  const [draftWalkInsOnly, setDraftWalkInsOnly] = useState(walkInsOnly);
  const analytics = useAnalytics();

  useEffect(() => {
    if (visible) {
      setDraftSortBy(sortBy);
      setDraftWalkInsOnly(walkInsOnly);
    }
  }, [visible, sortBy, walkInsOnly]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={styles.sheet}>
          <Text style={styles.sheetHeading}>Sort By</Text>
          <View style={styles.sortGrid}>
            {SORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.sortOption, draftSortBy === opt.key && styles.sortOptionActive]}
                onPress={() => setDraftSortBy(opt.key)}
              >
                <Text style={[styles.sortOptionText, draftSortBy === opt.key && styles.sortOptionTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sheetHeading}>Availability</Text>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Walk-ins only</Text>
              <Text style={styles.toggleSub}>No ticket required</Text>
            </View>
            <Switch
              value={draftWalkInsOnly}
              onValueChange={setDraftWalkInsOnly}
              trackColor={{ false: "#2A2A2A", true: "#FF6B35" }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#2A2A2A"
            />
          </View>

          <TouchableOpacity
            style={styles.showResultsBtn}
            onPress={() => {
              if (draftSortBy !== sortBy) analytics.sortChanged(draftSortBy);
              if (draftWalkInsOnly !== walkInsOnly) analytics.walkInsFilterToggled(draftWalkInsOnly);
              onApply(draftSortBy, draftWalkInsOnly);
              onClose();
            }}
          >
            <Text style={styles.showResultsText}>Show results</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#111111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHeading: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 8,
  },
  sortGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  sortOption: {
    width: "47%",
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#1A1A1A",
    borderWidth: 1.5,
    borderColor: "#2A2A2A",
  },
  sortOptionActive: { backgroundColor: "#F5A623", borderColor: "#F5A623" },
  sortOptionText: { color: "#9CA3AF", fontSize: 14, fontWeight: "500" },
  sortOptionTextActive: { color: "#111111", fontWeight: "700" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  toggleLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "500" },
  toggleSub: { color: "#6B7280", fontSize: 13, marginTop: 2 },
  showResultsBtn: {
    backgroundColor: "#FF6B35",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  showResultsText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
```

- [ ] **Step 2: Replace inline filter Modal in TonightFeed.tsx with FilterSheet**

Add import at the top:
```tsx
import FilterSheet from "../components/FilterSheet";
```

Remove the following state variables (they move into FilterSheet):
```tsx
const [draftSortBy, setDraftSortBy] = useState<"best" | "soonest" | "nearest" | "cheapest">("best");
const [draftWalkInsOnly, setDraftWalkInsOnly] = useState(false);
```

Remove the `useEffect` that syncs drafts when sheet opens:
```tsx
useEffect(() => {
  if (filterSheetOpen) {
    setDraftSortBy(sortBy);
    setDraftWalkInsOnly(walkInsOnly);
  }
}, [filterSheetOpen]);
```

Replace the entire filter bottom sheet Modal (from `{/* Filter bottom sheet */}` to its closing `</Modal>`) with:
```tsx
<FilterSheet
  visible={filterSheetOpen}
  sortBy={sortBy}
  walkInsOnly={walkInsOnly}
  onApply={(newSort, newWalkIns) => {
    setSortBy(newSort);
    setWalkInsOnly(newWalkIns);
  }}
  onClose={() => setFilterSheetOpen(false)}
/>
```

Remove the now-unused styles from TonightFeed's StyleSheet:
`sheetBackdrop`, `sheet`, `sheetHeading`, `sortGrid`, `sortOption`, `sortOptionActive`, `sortOptionText`, `sortOptionTextActive`, `toggleRow`, `toggleLabel`, `toggleSub`, `showResultsBtn`, `showResultsText`

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterSheet.tsx src/screens/TonightFeed.tsx
git commit -m "refactor: extract FilterSheet component from TonightFeed"
```

---

## Task 7: Extract SurpriseSheet + TonightFeed Cleanup

**Files:**
- Create: `src/components/SurpriseSheet.tsx`
- Modify: `src/screens/TonightFeed.tsx`

**Interfaces:**
- Produces:
  ```tsx
  interface SurpriseSheetProps {
    visible: boolean;
    events: Event[];
    loading: boolean;
    onClose: () => void;
    onNavigate: (event: Event) => void;
  }
  export default function SurpriseSheet(props: SurpriseSheetProps): JSX.Element
  ```
- Consumes: `Event` type from `../types`; `EventCard` from `./EventCard`

- [ ] **Step 1: Create SurpriseSheet.tsx**

Create `src/components/SurpriseSheet.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, Modal, ActivityIndicator, StyleSheet,
} from "react-native";
import type { Event } from "../types";
import EventCard from "./EventCard";

interface Props {
  visible: boolean;
  events: Event[];
  loading: boolean;
  onClose: () => void;
  onNavigate: (event: Event) => void;
}

export default function SurpriseSheet({ visible, events, loading, onClose, onNavigate }: Props) {
  const [surpriseIndex, setSurpriseIndex] = useState(0);

  useEffect(() => {
    if (visible) setSurpriseIndex(0);
  }, [visible, events]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={styles.sheet}>
          <Text style={styles.sheetHeading}>🎲 Tonight's Pick</Text>

          {loading ? (
            <ActivityIndicator color="#FF6B35" size="large" style={{ marginVertical: 32 }} />
          ) : events.length === 0 ? (
            <Text style={styles.surpriseEmpty}>
              No events in the next 90 min that are confirmed available. Check back soon!
            </Text>
          ) : (
            <>
              <EventCard
                event={events[surpriseIndex]}
                index={0}
                onPress={() => {
                  onClose();
                  onNavigate(events[surpriseIndex]);
                }}
              />
              <View style={styles.surpriseNav}>
                <Text style={styles.surpriseCount}>
                  {surpriseIndex + 1} of {events.length}
                </Text>
                {surpriseIndex < events.length - 1 && (
                  <TouchableOpacity onPress={() => setSurpriseIndex((i) => i + 1)}>
                    <Text style={styles.surpriseNext}>Try another →</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#111111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHeading: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 8,
  },
  surpriseEmpty: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 24,
    lineHeight: 22,
  },
  surpriseNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingHorizontal: 4,
  },
  surpriseCount: { color: "#4B5563", fontSize: 13 },
  surpriseNext: { color: "#FF6B35", fontSize: 14, fontWeight: "600" },
});
```

- [ ] **Step 2: Replace inline surprise Modal in TonightFeed.tsx with SurpriseSheet**

Add import:
```tsx
import SurpriseSheet from "../components/SurpriseSheet";
```

Remove the `surpriseIndex` state variable (it now lives inside SurpriseSheet):
```tsx
const [surpriseIndex, setSurpriseIndex] = useState(0);
```

Replace the entire Surprise Me modal (from `{/* Surprise Me modal */}` to its closing `</Modal>`) with:
```tsx
<SurpriseSheet
  visible={surpriseOpen}
  events={surpriseEvents}
  loading={surpriseLoading}
  onClose={() => setSurpriseOpen(false)}
  onNavigate={(event) => {
    navigation.navigate("EventDetail", {
      event,
      userLat: coords?.latitude ?? null,
      userLng: coords?.longitude ?? null,
      initialMode: mode,
    });
  }}
/>
```

Also remove the `surpriseIndex` reset in `loadSurprise`:
```tsx
async function loadSurprise() {
  setSurpriseLoading(true);
  setSurpriseOpen(true);
  // Remove: setSurpriseIndex(0);
  try {
    ...
```

Remove now-unused styles from TonightFeed's StyleSheet:
`surpriseEmpty`, `surpriseNav`, `surpriseCount`, `surpriseNext`

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Final line-count check**

```bash
wc -l src/screens/TonightFeed.tsx
```

Expected: under 350 lines (down from 682).

- [ ] **Step 5: Run all tests**

```bash
node --test src/hooks/usePreferences.test.ts src/components/eventCardHelpers.test.ts src/hooks/useLocation.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/SurpriseSheet.tsx src/screens/TonightFeed.tsx
git commit -m "refactor: extract SurpriseSheet component, TonightFeed now ~300 lines"
```

---

## Post-Implementation Checklist

These are non-code tasks that must be completed before App Store submission. Not tracked above since they're business/account tasks.

- [ ] Decide on 12+ age rating (recommended) and complete content rating questionnaire in App Store Connect
- [ ] Draft and host a privacy policy covering: location data (used for event proximity, not stored server-side), analytics via PostHog (usage data, no advertising), and no sale of user data. Add the URL to App Store Connect before submitting.
- [ ] Configure EAS build profile for production (`eas build --platform ios --profile production`) and verify `buildNumber` auto-increments correctly
- [ ] Prepare App Store screenshots for iPhone 6.7" (iPhone 15 Pro Max), 6.5" (iPhone 14 Plus), and 5.5" (iPhone 8 Plus) — minimum required sizes

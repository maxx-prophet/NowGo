# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 5-screen onboarding flow that captures identity, vibes, and budget preferences, stores them in AsyncStorage, and gates the app so new users see onboarding before the tonight feed.

**Architecture:** A separate `OnboardingStack` navigator sits alongside the existing `AppStack`. App.tsx checks AsyncStorage on mount — if `onboardingComplete` is false, it renders the onboarding stack; otherwise the main app. A shared `OnboardingLayout` wrapper handles consistent chrome (padding, step dots, CTA button). Preferences are read/written through a single `usePreferences` hook.

**Tech Stack:** React Native, TypeScript, AsyncStorage (`@react-native-async-storage/async-storage`), `node:test` for unit tests on the preferences hook logic.

**Spec:** `docs/superpowers/specs/2026-06-04-onboarding-flow-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `mobile/src/types/index.ts` | Modify | Add `UserPreferences` type |
| `mobile/src/hooks/usePreferences.ts` | Create | AsyncStorage read/write for preferences |
| `mobile/src/components/OnboardingLayout.tsx` | Create | Shared wrapper: padding, step dots, CTA button |
| `mobile/src/screens/onboarding/WelcomeScreen.tsx` | Create | Screen 1 — wordmark + headline + get started |
| `mobile/src/screens/onboarding/IdentityScreen.tsx` | Create | Screen 2 — local / transplant / visitor |
| `mobile/src/screens/onboarding/VibeScreen.tsx` | Create | Screen 3 — multi-select vibe grid |
| `mobile/src/screens/onboarding/BudgetScreen.tsx` | Create | Screen 4 — budget slider with snap points |
| `mobile/src/screens/onboarding/ReadyScreen.tsx` | Create | Screen 5 — summary + confirm |
| `mobile/src/hooks/usePreferences.test.ts` | Create | Unit tests for preference hook logic |
| `mobile/App.tsx` | Modify | Gate navigator on onboardingComplete |

---

## Design Tokens (use these exact values in every screen)

```ts
const GOLD = "#F5A623";
const BG = "#0A0A0A";
const CARD_BG = "#1A1A1A";
const CARD_BORDER = "#2A2A2A";
const MUTED = "#6B7280";
const DIMMED = "#4B5563";
```

---

## Task 1: Install AsyncStorage + Add UserPreferences Type

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/src/types/index.ts`

- [ ] **Step 1: Install AsyncStorage**

```bash
cd /Users/donniebolen/Desktop/NowGo/mobile
npx expo install @react-native-async-storage/async-storage
```

Expected: package added with no errors.

- [ ] **Step 2: Add UserPreferences type to `mobile/src/types/index.ts`**

Append to the existing file:

```ts
export type UserIdentity = "local" | "transplant" | "visitor";

export interface UserPreferences {
  identity: UserIdentity;
  vibes: string[];
  budgetMax: number | null; // null = no limit ($500+)
  onboardingComplete: boolean;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/types/index.ts
git commit -m "feat: add AsyncStorage and UserPreferences type (86b9wfdvf)"
```

---

## Task 2: usePreferences Hook

**Files:**
- Create: `mobile/src/hooks/usePreferences.ts`
- Create: `mobile/src/hooks/usePreferences.test.ts`

- [ ] **Step 1: Create `mobile/src/hooks/usePreferences.ts`**

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect } from "react";
import type { UserPreferences } from "../types";

const STORAGE_KEY = "@nowgo/preferences";

const DEFAULT_PREFERENCES: UserPreferences = {
  identity: "local",
  vibes: [],
  budgetMax: 50,
  onboardingComplete: false,
};

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(raw) });
      setLoading(false);
    });
  }, []);

  async function savePreferences(updates: Partial<UserPreferences>) {
    const next = { ...preferences, ...updates };
    setPreferences(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function completeOnboarding(final: Omit<UserPreferences, "onboardingComplete">) {
    const next: UserPreferences = { ...final, onboardingComplete: true };
    setPreferences(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function resetOnboarding() {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setPreferences(DEFAULT_PREFERENCES);
  }

  return { preferences, loading, savePreferences, completeOnboarding, resetOnboarding };
}
```

- [ ] **Step 2: Add test script to package.json if not present**

In `mobile/package.json`, ensure the `scripts` block contains:

```json
"test": "node --test src/hooks/usePreferences.test.ts"
```

- [ ] **Step 3: Create `mobile/src/hooks/usePreferences.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

// Pure logic tests — no AsyncStorage dependency needed

test("DEFAULT_PREFERENCES has onboardingComplete false", () => {
  const defaults = {
    identity: "local" as const,
    vibes: [],
    budgetMax: 50,
    onboardingComplete: false,
  };
  assert.equal(defaults.onboardingComplete, false);
  assert.deepEqual(defaults.vibes, []);
});

test("merging partial preferences preserves existing keys", () => {
  const existing = { identity: "local" as const, vibes: ["Jazz"], budgetMax: 100, onboardingComplete: false };
  const update = { vibes: ["Jazz", "Theater"] };
  const merged = { ...existing, ...update };
  assert.equal(merged.identity, "local");
  assert.equal(merged.budgetMax, 100);
  assert.deepEqual(merged.vibes, ["Jazz", "Theater"]);
});

test("completeOnboarding sets onboardingComplete true", () => {
  const final = { identity: "transplant" as const, vibes: ["Comedy"], budgetMax: 50 };
  const result = { ...final, onboardingComplete: true };
  assert.equal(result.onboardingComplete, true);
});

test("budgetMax null represents no limit", () => {
  const prefs = { identity: "local" as const, vibes: [], budgetMax: null, onboardingComplete: false };
  assert.equal(prefs.budgetMax, null);
});
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/donniebolen/Desktop/NowGo/mobile && npm test
```

Expected: 4 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/hooks/usePreferences.ts mobile/src/hooks/usePreferences.test.ts mobile/package.json
git commit -m "feat: add usePreferences hook with AsyncStorage (86b9wfdvf)"
```

---

## Task 3: OnboardingLayout Shared Component

**Files:**
- Create: `mobile/src/components/OnboardingLayout.tsx`

- [ ] **Step 1: Create `mobile/src/components/OnboardingLayout.tsx`**

```tsx
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";

interface Props {
  step: number;
  totalSteps: number;
  ctaLabel: string;
  onCta: () => void;
  ctaDisabled?: boolean;
  children: React.ReactNode;
}

export default function OnboardingLayout({ step, totalSteps, ctaLabel, onCta, ctaDisabled = false, children }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.content}>{children}</View>
        <View style={styles.bottom}>
          <TouchableOpacity
            style={[styles.cta, ctaDisabled && styles.ctaDisabled]}
            onPress={onCta}
            disabled={ctaDisabled}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </TouchableOpacity>
          <View style={styles.dots}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < step - 1 && styles.dotDone,
                  i === step - 1 && styles.dotActive,
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const GOLD = "#F5A623";
const CARD_BORDER = "#2A2A2A";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0A0A0A" },
  container: { flex: 1, justifyContent: "space-between", paddingHorizontal: 32, paddingTop: 24, paddingBottom: 32 },
  content: { flex: 1 },
  bottom: { gap: 16 },
  cta: {
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: "#0A0A0A", fontSize: 17, fontWeight: "700" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: CARD_BORDER },
  dotDone: { backgroundColor: GOLD },
  dotActive: { width: 20, backgroundColor: GOLD },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/OnboardingLayout.tsx
git commit -m "feat: add OnboardingLayout shared component (86b9wfdvf)"
```

---

## Task 4: WelcomeScreen

**Files:**
- Create: `mobile/src/screens/onboarding/WelcomeScreen.tsx`

- [ ] **Step 1: Create `mobile/src/screens/onboarding/WelcomeScreen.tsx`**

```tsx
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

const GOLD = "#F5A623";

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.top}>
          <Text style={styles.wordmark}>
            <Text style={styles.wordmarkNow}>Now</Text>
            <Text style={styles.wordmarkGo}>Go</Text>
          </Text>
          <Text style={styles.headline}>
            {"Tonight\nstarts\n"}
            <Text style={{ color: GOLD }}>now.</Text>
          </Text>
          <Text style={styles.sub}>
            NYC events, ranked for you.{"\n"}Leave on time. Never miss out.
          </Text>
        </View>
        <View style={styles.bottom}>
          <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate("Identity")} activeOpacity={0.8}>
            <Text style={styles.ctaText}>Get started →</Text>
          </TouchableOpacity>
          <View style={styles.dots}>
            <View style={[styles.dot, styles.dotActive]} />
            {[1, 2, 3, 4].map((i) => <View key={i} style={styles.dot} />)}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0A0A0A" },
  container: { flex: 1, justifyContent: "space-between", paddingHorizontal: 32, paddingTop: 40, paddingBottom: 32 },
  top: { flex: 1, justifyContent: "flex-start" },
  wordmark: { fontSize: 36, fontWeight: "800", marginBottom: 56 },
  wordmarkNow: { color: "#FFFFFF" },
  wordmarkGo: { color: GOLD, fontStyle: "italic" },
  headline: { fontSize: 48, fontWeight: "800", color: "#FFFFFF", lineHeight: 52, letterSpacing: -1.5, marginBottom: 20 },
  sub: { fontSize: 17, color: "#6B7280", lineHeight: 26 },
  bottom: { gap: 16 },
  cta: { backgroundColor: GOLD, borderRadius: 16, paddingVertical: 18, alignItems: "center" },
  ctaText: { color: "#0A0A0A", fontSize: 17, fontWeight: "700" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#2A2A2A" },
  dotActive: { width: 20, backgroundColor: GOLD },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/onboarding/WelcomeScreen.tsx
git commit -m "feat: add WelcomeScreen (86b9wfdvf)"
```

---

## Task 5: IdentityScreen

**Files:**
- Create: `mobile/src/screens/onboarding/IdentityScreen.tsx`

- [ ] **Step 1: Create `mobile/src/screens/onboarding/IdentityScreen.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import OnboardingLayout from "../../components/OnboardingLayout";
import type { UserIdentity } from "../../types";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

const CHOICES: { id: UserIdentity; emoji: string; title: string; desc: string }[] = [
  { id: "local",      emoji: "🗽", title: "Born & bred local",  desc: "I know the city — show me what I'm missing" },
  { id: "transplant", emoji: "🧳", title: "Transplant",          desc: "Still exploring — help me discover NYC" },
  { id: "visitor",    emoji: "✈️", title: "Just visiting",       desc: "In town for a bit — show me the best of it" },
];

const GOLD = "#F5A623";

export default function IdentityScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<UserIdentity | null>(null);

  return (
    <OnboardingLayout
      step={2}
      totalSteps={5}
      ctaLabel="Continue →"
      onCta={() => navigation.navigate("Vibe", { identity: selected })}
      ctaDisabled={selected === null}
    >
      <Text style={styles.stepLabel}>Step 2 of 5</Text>
      <Text style={styles.headline}>Are you a New{"\n"}Yorker?</Text>
      <Text style={styles.sub}>Helps us surface the right mix of events for you.</Text>

      <View style={styles.choices}>
        {CHOICES.map((c) => {
          const isSelected = selected === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.choice, isSelected && styles.choiceSelected]}
              onPress={() => setSelected(c.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.emoji}>{c.emoji}</Text>
              <View style={styles.choiceText}>
                <Text style={[styles.choiceTitle, isSelected && { color: GOLD }]}>{c.title}</Text>
                <Text style={styles.choiceDesc}>{c.desc}</Text>
              </View>
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  stepLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", color: "#F5A623", marginBottom: 20 },
  headline: { fontSize: 36, fontWeight: "800", color: "#FFFFFF", lineHeight: 40, letterSpacing: -1, marginBottom: 8 },
  sub: { fontSize: 15, color: "#6B7280", lineHeight: 22, marginBottom: 32 },
  choices: { gap: 12 },
  choice: { backgroundColor: "#1A1A1A", borderWidth: 1.5, borderColor: "#2A2A2A", borderRadius: 20, padding: 20, flexDirection: "row", alignItems: "center", gap: 16 },
  choiceSelected: { borderColor: "#F5A623", backgroundColor: "#1F1A10" },
  emoji: { fontSize: 30 },
  choiceText: { flex: 1 },
  choiceTitle: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", marginBottom: 3 },
  choiceDesc: { fontSize: 13, color: "#6B7280", lineHeight: 18 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#2A2A2A", alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: "#F5A623", backgroundColor: "#F5A623" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#0A0A0A" },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/onboarding/IdentityScreen.tsx
git commit -m "feat: add IdentityScreen (86b9wfdvf)"
```

---

## Task 6: VibeScreen

**Files:**
- Create: `mobile/src/screens/onboarding/VibeScreen.tsx`

- [ ] **Step 1: Create `mobile/src/screens/onboarding/VibeScreen.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import OnboardingLayout from "../../components/OnboardingLayout";
import type { UserIdentity } from "../../types";

type Params = { Vibe: { identity: UserIdentity } };

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<Params, "Vibe">;
}

const VIBES = [
  { id: "Jazz",      emoji: "🎷" },
  { id: "Comedy",    emoji: "😂" },
  { id: "Theater",   emoji: "🎭" },
  { id: "Art",       emoji: "🎨" },
  { id: "Outdoors",  emoji: "🌿" },
  { id: "Sports",    emoji: "🏆" },
  { id: "Film",      emoji: "🎬" },
  { id: "Nightlife", emoji: "🌙" },
  { id: "Talks",     emoji: "🎤" },
  { id: "Family",    emoji: "👨‍👩‍👧" },
];

const GOLD = "#F5A623";

export default function VibeScreen({ navigation, route }: Props) {
  const { identity } = route.params;
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]);
  }

  return (
    <OnboardingLayout
      step={3}
      totalSteps={5}
      ctaLabel="Continue →"
      onCta={() => navigation.navigate("Budget", { identity, vibes: selected })}
      ctaDisabled={selected.length === 0}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.stepLabel}>Step 3 of 5</Text>
        <Text style={styles.headline}>What's your{"\n"}vibe?</Text>
        <Text style={styles.sub}>Pick as many as you like.</Text>

        <View style={styles.grid}>
          {VIBES.map((v) => {
            const isSelected = selected.includes(v.id);
            return (
              <TouchableOpacity
                key={v.id}
                style={[styles.vibe, isSelected && styles.vibeSelected]}
                onPress={() => toggle(v.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.vibeEmoji}>{v.emoji}</Text>
                <Text style={[styles.vibeLabel, isSelected && { color: GOLD }]}>{v.id}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selected.length > 0 && (
          <Text style={styles.hint}>{selected.length} selected</Text>
        )}
      </ScrollView>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  stepLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", color: "#F5A623", marginBottom: 20 },
  headline: { fontSize: 36, fontWeight: "800", color: "#FFFFFF", lineHeight: 40, letterSpacing: -1, marginBottom: 8 },
  sub: { fontSize: 15, color: "#6B7280", lineHeight: 22, marginBottom: 28 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  vibe: {
    width: "30%",
    backgroundColor: "#1A1A1A",
    borderWidth: 1.5, borderColor: "#2A2A2A",
    borderRadius: 16, paddingVertical: 16,
    alignItems: "center", gap: 8,
  },
  vibeSelected: { borderColor: "#F5A623", backgroundColor: "#1F1A10" },
  vibeEmoji: { fontSize: 28 },
  vibeLabel: { fontSize: 12, fontWeight: "600", color: "#9CA3AF", textAlign: "center" },
  hint: { fontSize: 12, color: "#4B5563", textAlign: "center", marginTop: 12 },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/onboarding/VibeScreen.tsx
git commit -m "feat: add VibeScreen (86b9wfdvf)"
```

---

## Task 7: BudgetScreen

**Files:**
- Create: `mobile/src/screens/onboarding/BudgetScreen.tsx`

- [ ] **Step 1: Create `mobile/src/screens/onboarding/BudgetScreen.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, PanResponder } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import OnboardingLayout from "../../components/OnboardingLayout";
import type { UserIdentity } from "../../types";

type Params = { Budget: { identity: UserIdentity; vibes: string[] } };

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<Params, "Budget">;
}

const SNAP_POINTS: { label: string; value: number | null; desc: string }[] = [
  { label: "Free",  value: 0,    desc: "Free events only" },
  { label: "$50",   value: 50,   desc: "Good for most shows & events" },
  { label: "$100",  value: 100,  desc: "Broadway, concerts, dining" },
  { label: "$250",  value: 250,  desc: "Premium experiences" },
  { label: "$500+", value: null, desc: "No limit tonight" },
];

const GOLD = "#F5A623";
const TRACK_WIDTH = 310; // approximate usable width

export default function BudgetScreen({ navigation, route }: Props) {
  const { identity, vibes } = route.params;
  const [snapIndex, setSnapIndex] = useState(1); // default $50

  const current = SNAP_POINTS[snapIndex];
  const fillPct = snapIndex / (SNAP_POINTS.length - 1);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gs) => {
      const pct = Math.max(0, Math.min(1, gs.moveX / TRACK_WIDTH));
      const idx = Math.round(pct * (SNAP_POINTS.length - 1));
      setSnapIndex(idx);
    },
  });

  const priceDisplay = current.value === 0
    ? "Free"
    : current.value === null
    ? "$500+"
    : `$${current.value}`;

  return (
    <OnboardingLayout
      step={4}
      totalSteps={5}
      ctaLabel="Continue →"
      onCta={() => navigation.navigate("Ready", { identity, vibes, budgetMax: current.value })}
    >
      <Text style={styles.stepLabel}>Step 4 of 5</Text>
      <Text style={styles.headline}>What's your{"\n"}budget tonight?</Text>
      <Text style={styles.sub}>Drag to set your max spend.</Text>

      <View style={styles.priceDisplay}>
        <Text style={styles.priceLabel}>Up to</Text>
        <Text style={styles.priceValue}>{priceDisplay}</Text>
        <Text style={styles.priceDesc}>{current.desc}</Text>
      </View>

      {/* Slider */}
      <View style={styles.sliderContainer}>
        <View style={styles.track} {...panResponder.panHandlers}>
          <View style={[styles.fill, { width: `${fillPct * 100}%` }]} />
          <View style={[styles.thumb, { left: `${fillPct * 100}%` }]} />
        </View>
        <View style={styles.ticks}>
          {SNAP_POINTS.map((s) => (
            <Text key={s.label} style={styles.tickLabel}>{s.label}</Text>
          ))}
        </View>
      </View>

      {/* Quick-tap chips */}
      <View style={styles.chips}>
        {SNAP_POINTS.map((s, i) => (
          <TouchableOpacity
            key={s.label}
            style={[styles.chip, i === snapIndex && styles.chipActive]}
            onPress={() => setSnapIndex(i)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, i === snapIndex && { color: GOLD }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  stepLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", color: "#F5A623", marginBottom: 20 },
  headline: { fontSize: 36, fontWeight: "800", color: "#FFFFFF", lineHeight: 40, letterSpacing: -1, marginBottom: 8 },
  sub: { fontSize: 15, color: "#6B7280", lineHeight: 22 },
  priceDisplay: { alignItems: "center", marginTop: 40, marginBottom: 40 },
  priceLabel: { fontSize: 13, fontWeight: "600", color: "#4B5563", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  priceValue: { fontSize: 72, fontWeight: "800", color: "#F5A623", letterSpacing: -3, lineHeight: 76 },
  priceDesc: { fontSize: 14, color: "#6B7280", marginTop: 8 },
  sliderContainer: { marginBottom: 24 },
  track: { height: 6, backgroundColor: "#2A2A2A", borderRadius: 3, marginBottom: 12, position: "relative" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "#F5A623", borderRadius: 3 },
  thumb: {
    position: "absolute", top: "50%",
    marginTop: -15, marginLeft: -15,
    width: 30, height: 30,
    borderRadius: 15, backgroundColor: "#F5A623",
    shadowColor: "#F5A623", shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  ticks: { flexDirection: "row", justifyContent: "space-between" },
  tickLabel: { fontSize: 11, color: "#4B5563", fontWeight: "500" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#1A1A1A", borderWidth: 1.5, borderColor: "#2A2A2A", borderRadius: 20 },
  chipActive: { borderColor: "#F5A623", backgroundColor: "#1F1A10" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/onboarding/BudgetScreen.tsx
git commit -m "feat: add BudgetScreen with slider (86b9wfdvf)"
```

---

## Task 8: ReadyScreen

**Files:**
- Create: `mobile/src/screens/onboarding/ReadyScreen.tsx`

- [ ] **Step 1: Create `mobile/src/screens/onboarding/ReadyScreen.tsx`**

```tsx
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { usePreferences } from "../../hooks/usePreferences";
import type { UserIdentity } from "../../types";

type Params = { Ready: { identity: UserIdentity; vibes: string[]; budgetMax: number | null } };

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<Params, "Ready">;
}

const GOLD = "#F5A623";

const IDENTITY_LABELS: Record<UserIdentity, string> = {
  local:      "Born & bred local",
  transplant: "Transplant",
  visitor:    "Just visiting",
};

function budgetLabel(val: number | null): string {
  if (val === 0) return "Free only";
  if (val === null) return "$500+ (no limit)";
  return `Up to $${val}`;
}

export default function ReadyScreen({ navigation, route }: Props) {
  const { identity, vibes, budgetMax } = route.params;
  const { completeOnboarding } = usePreferences();

  async function handleGo() {
    await completeOnboarding({ identity, vibes, budgetMax });
    navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.top}>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.key}>You are</Text>
              <Text style={[styles.val, { color: GOLD }]}>{IDENTITY_LABELS[identity]}</Text>
            </View>
            <View style={[styles.row, styles.rowBorder]}>
              <Text style={styles.key}>Vibes</Text>
              <Text style={styles.val}>{vibes.length > 0 ? vibes.join(" · ") : "Everything"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.key}>Budget</Text>
              <Text style={[styles.val, { color: GOLD }]}>{budgetLabel(budgetMax)}</Text>
            </View>
          </View>

          <Text style={styles.headline}>
            {"You're all\nset. "}
            <Text style={{ color: GOLD }}>Go.</Text>
          </Text>
          <Text style={styles.sub}>Tonight's events, ranked for you.{"\n"}Change this anytime in settings.</Text>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity style={styles.cta} onPress={handleGo} activeOpacity={0.8}>
            <Text style={styles.ctaText}>Show me tonight →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate("Identity")} activeOpacity={0.6}>
            <Text style={styles.secondary}>Change preferences</Text>
          </TouchableOpacity>
          <View style={styles.dots}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.dot, styles.dotDone]} />
            ))}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0A0A0A" },
  container: { flex: 1, justifyContent: "space-between", paddingHorizontal: 32, paddingTop: 40, paddingBottom: 32 },
  top: {},
  card: { backgroundColor: "#1A1A1A", borderWidth: 1.5, borderColor: "#2A2A2A", borderRadius: 24, padding: 20, marginBottom: 36 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#242424" },
  key: { fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: "#4B5563" },
  val: { fontSize: 14, fontWeight: "600", color: "#FFFFFF", textAlign: "right", flex: 1, marginLeft: 16 },
  headline: { fontSize: 42, fontWeight: "800", color: "#FFFFFF", lineHeight: 46, letterSpacing: -1.5, marginBottom: 12 },
  sub: { fontSize: 16, color: "#6B7280", lineHeight: 24 },
  bottom: { gap: 12 },
  cta: { backgroundColor: GOLD, borderRadius: 16, paddingVertical: 20, alignItems: "center" },
  ctaText: { color: "#0A0A0A", fontSize: 18, fontWeight: "800" },
  secondary: { textAlign: "center", fontSize: 14, color: "#4B5563", fontWeight: "500" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#2A2A2A" },
  dotDone: { backgroundColor: GOLD },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/onboarding/ReadyScreen.tsx
git commit -m "feat: add ReadyScreen (86b9wfdvf)"
```

---

## Task 9: Wire Onboarding into App.tsx

**Files:**
- Modify: `mobile/App.tsx`

- [ ] **Step 1: Update `mobile/App.tsx`**

Replace the entire file with:

```tsx
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

import TonightFeed from "./src/screens/TonightFeed";
import EventDetail from "./src/screens/EventDetail";
import FiltersModal from "./src/screens/FiltersModal";
import WelcomeScreen from "./src/screens/onboarding/WelcomeScreen";
import IdentityScreen from "./src/screens/onboarding/IdentityScreen";
import VibeScreen from "./src/screens/onboarding/VibeScreen";
import BudgetScreen from "./src/screens/onboarding/BudgetScreen";
import ReadyScreen from "./src/screens/onboarding/ReadyScreen";

const Stack = createNativeStackNavigator();
const appEnv: string = Constants.expoConfig?.extra?.appEnv ?? "production";

const DARK_HEADER = {
  headerStyle: { backgroundColor: "#0A0A0A" },
  headerTintColor: "#FFFFFF",
  headerTitleStyle: { fontWeight: "700" as const },
  contentStyle: { backgroundColor: "#0A0A0A" },
};

function EnvBadge() {
  if (appEnv === "production") return null;
  const label = appEnv === "development" ? "DEV" : "STAGING";
  const color = appEnv === "development" ? "#F59E0B" : "#6366F1";
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function OnboardingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0A0A" } }}>
      <Stack.Screen name="Welcome"  component={WelcomeScreen} />
      <Stack.Screen name="Identity" component={IdentityScreen as React.ComponentType<any>} />
      <Stack.Screen name="Vibe"     component={VibeScreen as React.ComponentType<any>} />
      <Stack.Screen name="Budget"   component={BudgetScreen as React.ComponentType<any>} />
      <Stack.Screen name="Ready"    component={ReadyScreen as React.ComponentType<any>} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={DARK_HEADER}>
      <Stack.Screen name="TonightFeed"  component={TonightFeed} options={{ title: "Tonight in NYC" }} />
      <Stack.Screen name="EventDetail"  component={EventDetail as React.ComponentType<any>} options={{ title: "Event" }} />
      <Stack.Screen name="Filters"      component={FiltersModal as React.ComponentType<any>} options={{ presentation: "modal", title: "Filters" }} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("@nowgo/preferences").then((raw) => {
      if (raw) {
        const prefs = JSON.parse(raw);
        setOnboarded(prefs.onboardingComplete === true);
      }
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <EnvBadge />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {onboarded ? (
          <Stack.Screen name="Main" component={AppStack} />
        ) : (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingStack} />
            <Stack.Screen name="Main" component={AppStack} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute", top: 56, right: 12, zIndex: 999,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  badgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: 4 pass, 0 fail.

- [ ] **Step 4: Commit**

```bash
git add mobile/App.tsx
git commit -m "feat: wire onboarding navigator into App.tsx (86b9wfdvf)"
```

---

## Task 10: End-to-End Verification

- [ ] **Step 1: Start the app**

```bash
cd /Users/donniebolen/Desktop/NowGo/mobile && npx expo start
```

Press `i` to open iOS simulator.

- [ ] **Step 2: Verify onboarding shows on first launch**

Expected: Welcome screen appears (not TonightFeed). NowGo wordmark visible, gold CTA button.

- [ ] **Step 3: Walk through all 5 screens**

- Welcome → tap "Get started →" → Identity screen appears
- Select any identity → "Continue →" enabled → tap → Vibe screen appears
- Select at least 1 vibe → count shows below grid → "Continue →" enabled → tap → Budget screen appears
- Drag slider or tap a chip → price updates → tap "Continue →" → Ready screen appears
- Summary card shows correct selections → tap "Show me tonight →" → TonightFeed appears

- [ ] **Step 4: Verify preferences persisted**

Close and reopen the simulator app. Expected: TonightFeed loads directly — onboarding does not show again.

- [ ] **Step 5: Final commit and push**

```bash
git add -A && git commit -m "feat: onboarding flow complete (86b9wfdvf)" && git push origin main
```

# Onboarding Flow Design Spec

**Date:** 2026-06-04
**ClickUp:** [86b9wfdvf](https://app.clickup.com/t/86b9wfdvf)
**Status:** Approved, pending implementation

---

## Overview

5-screen onboarding flow that captures user preferences before showing the tonight feed. Anonymous-first — no account required. Preferences stored in device local storage via AsyncStorage. Bold, minimal, gets out of the way fast.

**Brand:** Dark background (`#0A0A0A`), NowGo gold (`#F5A623`), white type. All interactive elements use gold.

---

## Screens

### Screen 1 — Welcome

- NowGo wordmark top-left ("Now" white serif, "Go" gold italic, Georgia font)
- Headline: **"Tonight starts now."** — 48px, 800 weight, "now." in gold
- Subline: "NYC events, ranked for you. Leave on time. Never miss out." — grey
- CTA: **"Get started →"** — gold button, dark text
- Step dots: 1 active (gold pill), 4 inactive

### Screen 2 — Who Are You?

- Step label: "STEP 2 OF 5" in gold
- Headline: **"Are you a New Yorker?"**
- Three choices (single select, radio style with gold border when selected):
  - 🗽 **Born & bred local** — "I know the city — show me what I'm missing"
  - 🧳 **Transplant** — "Still exploring — help me discover NYC"
  - ✈️ **Just visiting** — "In town for a bit — show me the best of it"
- CTA: **"Continue →"**

### Screen 3 — Vibe Selection

- Step label: "STEP 3 OF 5"
- Headline: **"What's your vibe?"**
- Subline: "Pick as many as you like."
- 3-column grid, multi-select, gold border + gold label when selected:
  - 🎷 Jazz · 😂 Comedy · 🎭 Theater
  - 🎨 Art · 🌿 Outdoors · 🏆 Sports
  - 🎬 Film · 🌙 Nightlife · 🎤 Talks · 👨‍👩‍👧 Family
- Count hint below grid: "X selected"
- CTA: **"Continue →"**

### Screen 4 — Budget

- Step label: "STEP 4 OF 5"
- Headline: **"What's your budget tonight?"**
- Subline: "Drag to set your max spend."
- Large gold price display: "Up to $[value]" — 80px, updates live
- Contextual sub-label changes per value:
  - Free → "Free events only"
  - $50 → "Good for most shows & events"
  - $100 → "Broadway, concerts, dining"
  - $250 → "Premium experiences"
  - $500+ → "No limit tonight"
- Slider with 5 snap points: Free / $50 / $100 / $250 / $500+
  - Gold fill + gradient, gold thumb with glow
  - Tick marks with labels
- Quick-tap chips below slider (same 5 values) — mirrors slider state
- CTA: **"Continue →"**

### Screen 5 — Confirmation

- Summary card (dark card, subtle border) showing:
  - **You are:** [their screen 2 choice] — gold
  - **Vibes:** [comma-separated selections]
  - **Budget:** Up to $[value] — gold
- Headline: **"You're all set. Go."** — "Go." in gold
- Subline: "Tonight's events, ranked for you. Change this anytime in settings."
- Primary CTA: **"Show me tonight →"** — gold, large
- Secondary: "Change preferences" — grey text link
- All 5 dots complete (all gold)

---

## Data Model

Stored in AsyncStorage under key `@nowgo/preferences`:

```ts
interface UserPreferences {
  identity: "local" | "transplant" | "visitor";
  vibes: string[];  // e.g. ["Jazz", "Theater", "Sports"]
  budgetMax: number | null;  // null = $500+ (no limit)
  onboardingComplete: boolean;
}
```

---

## Navigation

- Onboarding shown only if `onboardingComplete !== true` in AsyncStorage
- On confirmation → write preferences → navigate to `TonightFeed`
- "Change preferences" → navigate back to screen 2 (keeps existing selections)
- Skip logic: none — all 5 steps required for MVP

---

## Architecture

- `src/screens/onboarding/WelcomeScreen.tsx`
- `src/screens/onboarding/IdentityScreen.tsx`
- `src/screens/onboarding/VibeScreen.tsx`
- `src/screens/onboarding/BudgetScreen.tsx`
- `src/screens/onboarding/ReadyScreen.tsx`
- `src/hooks/usePreferences.ts` — AsyncStorage read/write hook
- `src/types/index.ts` — add `UserPreferences` type

Onboarding screens use a shared `OnboardingLayout` wrapper component for consistent padding, step dots, and CTA button.

App.tsx gates the navigator: if `onboardingComplete` is false, render `OnboardingStack`; otherwise render the main `AppStack`.

---

## Design Tokens (shared across all screens)

```ts
const GOLD = "#F5A623";
const BG = "#0A0A0A";
const CARD_BG = "#1A1A1A";
const CARD_BORDER = "#2A2A2A";
const MUTED = "#6B7280";
const DIMMED = "#4B5563";
```

---

## Mockups

Saved in `.superpowers/brainstorm/` — open the session files to reference each screen.

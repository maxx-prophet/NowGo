# Event Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `EventCard.tsx` to use a two-section layout (dot + name + venue + hook on top; fixed-height 2-row metadata pill on bottom) that is visually consistent regardless of label length.

**Architecture:** Extract all pure display logic (leave-by, contextual label, price, time) into a separate `eventCardHelpers.ts` so it can be unit-tested with Node's built-in test runner. `EventCard` becomes a thin rendering layer over those helpers. `TonightFeed` passes a stagger `index` prop to `EventCard` for entrance animation.

**Tech Stack:** React Native `Animated` API, TypeScript, Node built-in test runner (`node:test` + `node:assert/strict`)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types/index.ts` | Modify | Add `hook` field to `Event` interface |
| `src/components/eventCardHelpers.ts` | Create | Pure display-logic functions: `leaveByResult`, `contextualLabelResult`, `formatTime`, `formatPrice` |
| `src/components/eventCardHelpers.test.ts` | Create | Unit tests for all helper functions |
| `src/components/EventCard.tsx` | Rewrite | Card UI using helpers + Animated entrance |
| `src/screens/TonightFeed.tsx` | Modify | Pass `index` from `renderItem` to `EventCard` |
| `mobile/package.json` | Modify | Add new test file to `test` script |

---

## Task 1: Add `hook` to Event type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add hook field**

Open `src/types/index.ts`. Add `hook` to the `Event` interface after `walk_in`:

```typescript
export interface Event {
  event_id: string;
  name: string;
  start_time: string;
  end_time?: string | null;
  url?: string | null;
  segment?: string | null;
  genre?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  is_free: boolean;
  availability_tier: string;
  venue_name?: string | null;
  venue_address?: string | null;
  neighborhood?: string | null;
  leave_by?: string | null;
  travel_minutes?: number | null;
  travel_distance_km?: number | null;
  travel_source?: string | null;
  surprise_score?: number | null;
  walk_in?: boolean | null;
  hook?: string | null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/donniebolen/Desktop/NowGo/mobile && npx tsc --noEmit
```

Expected: no errors related to `hook`.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add hook field to Event type"
```

---

## Task 2: Create display-logic helpers

**Files:**
- Create: `src/components/eventCardHelpers.ts`
- Create: `src/components/eventCardHelpers.test.ts`
- Modify: `package.json` (test script)

- [ ] **Step 1: Update package.json test script**

In `package.json`, change the `test` script from:

```json
"test": "node --test src/hooks/usePreferences.test.ts"
```

To:

```json
"test": "node --test src/hooks/usePreferences.test.ts src/components/eventCardHelpers.test.ts"
```

- [ ] **Step 2: Create the test file**

Create `src/components/eventCardHelpers.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPrice,
  leaveByResult,
  contextualLabelResult,
} from "./eventCardHelpers.js";

// formatPrice
test("formatPrice: free event returns FREE", () => {
  assert.equal(formatPrice(null, null, true), "FREE");
});

test("formatPrice: no price data returns dash", () => {
  assert.equal(formatPrice(null, null, false), "—");
});

test("formatPrice: single price", () => {
  assert.equal(formatPrice(35, 35, false), "$35");
});

test("formatPrice: price range", () => {
  assert.equal(formatPrice(20, 50, false), "$20–$50");
});

// leaveByResult
test("leaveByResult: sold_out ignores leave_by", () => {
  const now = new Date("2026-06-16T20:00:00Z");
  const future = "2026-06-16T21:00:00Z";
  const result = leaveByResult(future, "sold_out", now);
  assert.equal(result.text, "No travel needed");
  assert.equal(result.bold, false);
});

test("leaveByResult: null leave_by returns empty text", () => {
  const now = new Date("2026-06-16T20:00:00Z");
  const result = leaveByResult(null, "available", now);
  assert.equal(result.text, "");
});

test("leaveByResult: leave_by more than 5min past returns Underway", () => {
  const now = new Date("2026-06-16T20:10:00Z");
  const leaveBy = "2026-06-16T20:00:00Z"; // 10 min ago
  const result = leaveByResult(leaveBy, "available", now);
  assert.equal(result.text, "Underway");
});

test("leaveByResult: leave_by just passed returns Leave NOW", () => {
  const now = new Date("2026-06-16T20:02:00Z");
  const leaveBy = "2026-06-16T20:00:00Z"; // 2 min ago
  const result = leaveByResult(leaveBy, "available", now);
  assert.equal(result.text, "⚡ Leave NOW");
  assert.equal(result.bold, true);
  assert.equal(result.color, "#EF4444");
});

test("leaveByResult: leave_by within 30min shows Leave in Xm", () => {
  const now = new Date("2026-06-16T20:00:00Z");
  const leaveBy = "2026-06-16T20:15:00Z"; // 15 min from now
  const result = leaveByResult(leaveBy, "available", now);
  assert.equal(result.text, "Leave in 15m");
});

test("leaveByResult: leave_by over 30min shows Leave by time", () => {
  const now = new Date("2026-06-16T20:00:00Z");
  const leaveBy = "2026-06-16T20:45:00Z"; // 45 min from now
  const result = leaveByResult(leaveBy, "available", now);
  assert.ok(result.text.startsWith("Leave by"));
  assert.equal(result.color, "#22C55E");
});

// contextualLabelResult
test("contextualLabelResult: null travelMinutes returns Time unknown", () => {
  const now = new Date("2026-06-16T20:00:00Z");
  const result = contextualLabelResult("2026-06-16T21:00:00Z", null, now);
  assert.equal(result.text, "Time unknown");
});

test("contextualLabelResult: event started <2hrs ago shows Started X min ago", () => {
  const now = new Date("2026-06-16T20:30:00Z");
  const startTime = "2026-06-16T20:00:00Z"; // started 30 min ago
  const result = contextualLabelResult(startTime, 10, now);
  assert.ok(result.text.startsWith("Started 30 min ago"));
});

test("contextualLabelResult: event started >2hrs ago returns Underway", () => {
  const now = new Date("2026-06-16T23:00:00Z");
  const startTime = "2026-06-16T20:00:00Z"; // 3 hrs ago
  const result = contextualLabelResult(startTime, 10, now);
  assert.equal(result.text, "Underway");
});

test("contextualLabelResult: starts in <60min shows Starts in X min", () => {
  const now = new Date("2026-06-16T19:30:00Z");
  const startTime = "2026-06-16T20:00:00Z"; // 30 min away
  const result = contextualLabelResult(startTime, 10, now);
  assert.equal(result.text, "Starts in 30 min");
});

test("contextualLabelResult: starts in >60min shows Starts in Xh Ym", () => {
  const now = new Date("2026-06-16T18:00:00Z");
  const startTime = "2026-06-16T20:00:00Z"; // 2hrs away
  const result = contextualLabelResult(startTime, 10, now);
  assert.equal(result.text, "Starts in 2h 0m");
});
```

- [ ] **Step 3: Run tests — verify they fail (no helpers file yet)**

```bash
cd /Users/donniebolen/Desktop/NowGo/mobile && npm test
```

Expected: `eventCardHelpers.test.ts` fails with `Cannot find module './eventCardHelpers.js'`. `usePreferences` tests still pass.

- [ ] **Step 4: Create the helpers file**

Create `src/components/eventCardHelpers.ts`:

```typescript
export interface LeaveByResult {
  text: string;
  color: string;
  bold: boolean;
}

export interface ContextualResult {
  text: string;
  color: string;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
}

export function formatPrice(
  min: number | null | undefined,
  max: number | null | undefined,
  isFree: boolean
): string {
  if (isFree) return "FREE";
  if (!min && !max) return "—";
  if (!max || min === max) return `$${Math.round(min!)}`;
  return `$${Math.round(min!)}–$${Math.round(max)}`;
}

export function leaveByResult(
  leaveBy: string | null | undefined,
  availabilityTier: string,
  now: Date = new Date()
): LeaveByResult {
  if (availabilityTier === "sold_out") {
    return { text: "No travel needed", color: "#6B7280", bold: false };
  }
  if (!leaveBy) {
    return { text: "", color: "#22C55E", bold: false };
  }
  const diffMin = (new Date(leaveBy).getTime() - now.getTime()) / 60_000;

  if (diffMin < -5) return { text: "Underway", color: "#6B7280", bold: false };
  if (diffMin <= 0) return { text: "⚡ Leave NOW", color: "#EF4444", bold: true };
  if (diffMin < 30) return { text: `Leave in ${Math.ceil(diffMin)}m`, color: "#22C55E", bold: false };
  return { text: `Leave by ${formatTime(leaveBy)}`, color: "#22C55E", bold: false };
}

export function contextualLabelResult(
  startTime: string,
  travelMinutes: number | null | undefined,
  now: Date = new Date()
): ContextualResult {
  if (travelMinutes == null) {
    return { text: "Time unknown", color: "#60a5fa" };
  }
  const startDate = new Date(startTime);
  const minutesSinceStart = (now.getTime() - startDate.getTime()) / 60_000;
  const minutesUntilStart = -minutesSinceStart;

  if (minutesSinceStart > 120) {
    return { text: "Underway", color: "#6B7280" };
  }
  if (minutesSinceStart > 0) {
    return {
      text: `Started ${Math.floor(minutesSinceStart)} min ago — still worth going`,
      color: "#60a5fa",
    };
  }
  if (minutesUntilStart < 60) {
    return { text: `Starts in ${Math.ceil(minutesUntilStart)} min`, color: "#60a5fa" };
  }
  const h = Math.floor(minutesUntilStart / 60);
  const m = Math.ceil(minutesUntilStart % 60);
  return { text: `Starts in ${h}h ${m}m`, color: "#60a5fa" };
}
```

- [ ] **Step 5: Run tests — verify helpers pass**

```bash
cd /Users/donniebolen/Desktop/NowGo/mobile && npm test
```

Expected: all 14 tests pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/components/eventCardHelpers.ts src/components/eventCardHelpers.test.ts package.json
git commit -m "feat: add EventCard display-logic helpers with tests"
```

---

## Task 3: Rewrite EventCard — top section

**Files:**
- Rewrite: `src/components/EventCard.tsx`

- [ ] **Step 1: Replace the file with the new top-section skeleton**

Replace the entire contents of `src/components/EventCard.tsx` with:

```tsx
import React, { useRef, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from "react-native";
import type { Event } from "../types";
import {
  formatTime, formatPrice, leaveByResult, contextualLabelResult,
} from "./eventCardHelpers";

const SEGMENT_COLORS: Record<string, string> = {
  Music: "#F59E0B",
  Jazz: "#F59E0B",
  Sports: "#3B82F6",
  Theatre: "#8B5CF6",
  "Arts & Theatre": "#8B5CF6",
  Comedy: "#8B5CF6",
  Outdoors: "#10B981",
  Family: "#10B981",
  Film: "#EC4899",
  Talks: "#EC4899",
  Nightlife: "#EC4899",
};

const SEGMENT_EMOJI: Record<string, string> = {
  Music: "🎵",
  Jazz: "🎷",
  Sports: "🏆",
  Theatre: "🎭",
  "Arts & Theatre": "🎭",
  Comedy: "🎤",
  Outdoors: "🌳",
  Family: "🌳",
  Film: "🎬",
  Talks: "💬",
  Nightlife: "🌙",
};

const AVAILABILITY_BADGES: Record<string, { label: string; bg: string; color: string }> = {
  available:    { label: "✅ Available", bg: "#14532d", color: "#4ade80" },
  limited:      { label: "⚠️ Limited",   bg: "#422006", color: "#fb923c" },
  walk_in:      { label: "🚶 Walk-in",   bg: "#1e3a5f", color: "#93c5fd" },
  walk_in_only: { label: "🚶 Walk-in",   bg: "#1e3a5f", color: "#93c5fd" },
  sold_out:     { label: "🚫 Sold Out",  bg: "#1F1F1F", color: "#6B7280" },
};

interface EventCardProps {
  event: Event;
  onPress: () => void;
  index?: number;
}

export default function EventCard({ event, onPress, index = 0 }: EventCardProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: 300, delay: index * 60, useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0, duration: 300, delay: index * 60, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const now = new Date();
  const isSoldOut = event.availability_tier === "sold_out";
  const dotColor = SEGMENT_COLORS[event.segment ?? ""] ?? "#6B7280";
  const emoji = SEGMENT_EMOJI[event.segment ?? ""] ?? "📍";
  const badge = AVAILABILITY_BADGES[event.availability_tier] ?? {
    label: "📅 Check", bg: "#1F1F1F", color: "#6B7280",
  };
  const price = formatPrice(event.price_min, event.price_max, event.is_free);
  const timeStr = formatTime(event.start_time);
  const lb = leaveByResult(event.leave_by, event.availability_tier, now);
  const ctx = contextualLabelResult(event.start_time, event.travel_minutes, now);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <TouchableOpacity
        style={[styles.card, isSoldOut && styles.soldOut]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        {/* Top section */}
        <View style={styles.top}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <View style={styles.topContent}>
            <Text style={[styles.name, isSoldOut && styles.nameMuted]} numberOfLines={2}>
              {event.name}
            </Text>
            <Text style={[styles.venue, isSoldOut && styles.venueMuted]} numberOfLines={1}>
              {emoji} {event.venue_name ?? "Venue TBD"}
              {event.neighborhood ? ` · ${event.neighborhood}` : ""}
            </Text>
            {event.hook ? (
              <Text style={styles.hook} numberOfLines={2}>
                {`"${event.hook}"`}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Bottom 2-row pill — Task 4 */}
        <View style={styles.pill}>
          {/* Row 1 */}
          <View style={styles.pillRow1}>
            <View style={styles.priceTime}>
              <Text style={[styles.priceText, event.is_free && styles.priceFree]}>
                {price}
              </Text>
              <Text style={styles.sep}>·</Text>
              <Text style={styles.timeText}>{timeStr}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>
                {badge.label}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Row 2 */}
          <View style={styles.pillRow2}>
            <Text
              style={[styles.contextual, { color: ctx.color }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {ctx.text}
            </Text>
            {lb.text ? (
              <Text style={[styles.leaveBy, { color: lb.color }, lb.bold && styles.leaveBold]}>
                {lb.text}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  soldOut: {
    opacity: 0.7,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  topContent: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    marginBottom: 3,
  },
  nameMuted: {
    color: "#9CA3AF",
  },
  venue: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 5,
  },
  venueMuted: {
    color: "#4B5563",
  },
  hook: {
    color: "#9CA3AF",
    fontSize: 13,
    fontStyle: "italic",
  },
  pill: {
    backgroundColor: "#141414",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pillRow1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  priceTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  priceText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  priceFree: {
    color: "#4ade80",
  },
  sep: {
    color: "#374151",
    fontSize: 11,
  },
  timeText: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  badge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#1F2937",
    marginBottom: 6,
  },
  pillRow2: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  contextual: {
    flex: 1,
    fontSize: 11,
    marginRight: 8,
  },
  leaveBy: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 0,
  },
  leaveBold: {
    fontWeight: "700",
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/donniebolen/Desktop/NowGo/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/EventCard.tsx
git commit -m "feat: rewrite EventCard with 2-row pill layout and stagger animation"
```

---

## Task 4: Wire index prop in TonightFeed

**Files:**
- Modify: `src/screens/TonightFeed.tsx` (line ~246)

- [ ] **Step 1: Pass index from FlatList renderItem**

Find the `renderItem` call for the events `FlatList` in `TonightFeed.tsx`. It currently reads:

```tsx
renderItem={({ item }) => (
  <EventCard
    event={item}
    onPress={() => navigation.navigate("EventDetail", { event: item })}
  />
)}
```

Change it to:

```tsx
renderItem={({ item, index }) => (
  <EventCard
    event={item}
    index={index}
    onPress={() => navigation.navigate("EventDetail", { event: item })}
  />
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/donniebolen/Desktop/NowGo/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
cd /Users/donniebolen/Desktop/NowGo/mobile && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/screens/TonightFeed.tsx
git commit -m "feat: pass stagger index to EventCard from TonightFeed"
```

---

## Task 5: Smoke-test on device

**Files:** none

- [ ] **Step 1: Start the app**

```bash
cd /Users/donniebolen/Desktop/NowGo/mobile && npx expo run:ios
```

Or if Metro is already running, press `r` to reload.

- [ ] **Step 2: Verify the feed**

Check each of the following visually:
- Cards fade in and slide up on load (staggered, not all at once)
- Each card has: dot → name (max 2 lines) → venue+emoji+neighborhood → hook (italic, only if present)
- Bottom pill Row 1: price on left, badge on right — they never overlap
- Bottom pill Row 2: contextual label truncates with `…` if too long; leave-by is always visible on the right
- Sold-out cards appear dimmed (opacity ~0.7) with "No travel needed" in gray

- [ ] **Step 3: Final commit tag**

```bash
git add -p  # stage any last tweaks
git commit -m "feat: event card redesign complete — 2-row pill + hook + stagger"
```

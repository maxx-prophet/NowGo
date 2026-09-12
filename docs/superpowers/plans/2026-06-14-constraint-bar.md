# Constraint Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign TonightFeed filter controls into a constraint bar with 12-category pills, budget chips, inline mode picker, and a slide-up filter bottom sheet (sort + walk-ins toggle), plus a count label truncation bug fix.

**Architecture:** All filter state stays local to `TonightFeed`. The constraint bar renders as two fixed rows above the event `FlatList`. The mode picker is an absolutely-positioned inline dropdown. The filter sheet uses RN's built-in `Modal` with `animationType="slide"` to avoid adding a bottom-sheet library. The API layer maps frontend state values (`"walk"`, `"drive"`, `"best"`) to the existing backend query params.

**Tech Stack:** React Native 0.81.5 / Expo 54, TypeScript, `expo-linear-gradient` (new install), Node.js/Express backend (`src/server.js`)

---

## File Map

| File | Change |
|---|---|
| `mobile/src/types/index.ts` | Add `budgetMax`, `sortBy`, `walkInsOnly` to `FetchEventsParams` |
| `mobile/src/api/nowgo.ts` | Map new params + mode values into query string |
| `src/server.js` | Parse `budget_max` + `walk_ins_only`; add `e.walk_in` to SELECTs; post-filter rows |
| `mobile/src/screens/TonightFeed.tsx` | Full constraint bar redesign, bottom sheet, bug fix |

`FiltersModal.tsx` is **not touched** — the old navigation route stays wired up for now; it just won't be reachable from the new UI.

---

## Task 1: Update FetchEventsParams type

**Files:**
- Modify: `mobile/src/types/index.ts:23-29`

- [ ] **Step 1: Edit the interface**

Replace the existing `FetchEventsParams` interface:

```ts
export interface FetchEventsParams {
  lat?: number | null;
  lng?: number | null;
  mode?: "transit" | "walk" | "drive";
  segment?: string;
  radiusMiles?: number;
  budgetMax?: number | null;
  sortBy?: "best" | "soonest" | "nearest" | "cheapest";
  walkInsOnly?: boolean;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors on `src/types/index.ts`.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/types/index.ts
git commit -m "feat: add budgetMax, sortBy, walkInsOnly to FetchEventsParams"
```

---

## Task 2: Update API layer

**Files:**
- Modify: `mobile/src/api/nowgo.ts`

- [ ] **Step 1: Replace fetchTonightEvents implementation**

```ts
import Constants from "expo-constants";
import type { FetchEventsParams, Event } from "../types";

const API_BASE: string =
  Constants.expoConfig?.extra?.apiUrl ?? "https://nowgo-production.up.railway.app";

const MODE_API_MAP: Record<string, string> = {
  transit: "transit",
  walk: "walking",
  drive: "driving",
};

const SORT_API_MAP: Record<string, string> = {
  best: "best_match",
  soonest: "soonest",
  nearest: "nearest",
  cheapest: "cheapest",
};

export async function fetchTonightEvents(
  {
    lat,
    lng,
    mode = "transit",
    segment,
    radiusMiles = 10,
    budgetMax,
    sortBy = "best",
    walkInsOnly = false,
  }: FetchEventsParams = {}
): Promise<{ events: Event[] }> {
  const params = new URLSearchParams({ limit: "50", radius_miles: String(radiusMiles) });
  if (lat != null && lng != null) {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
    params.set("mode", MODE_API_MAP[mode ?? "transit"] ?? "transit");
  }
  if (segment && segment !== "All") params.set("segment", segment);
  if (budgetMax != null) params.set("budget_max", String(budgetMax));
  params.set("sort", SORT_API_MAP[sortBy ?? "best"] ?? "best_match");
  if (walkInsOnly) params.set("walk_ins_only", "true");

  const res = await fetch(`${API_BASE}/events/tonight?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchEvent(id: string): Promise<Event> {
  const res = await fetch(`${API_BASE}/events/${id}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/nowgo.ts
git commit -m "feat: pass budgetMax, sortBy, walkInsOnly to /events/tonight"
```

---

## Task 3: Backend — walk_ins_only + budget_max filtering

**Files:**
- Modify: `src/server.js:54-144`

The backend already parses `sort` (→ `rankEvents`) and `budget` (→ ranking scorer). This task adds `walk_ins_only` SQL-style post-filtering and `budget_max` hard filtering, and exposes `walk_in` in the response.

- [ ] **Step 1: Add new query-param parsing (after line 65 in server.js)**

After the existing `const hasGeo = ...` line, add:

```js
const budgetMax = req.query.budget_max != null ? parseFloat(req.query.budget_max) : null;
const walkInsOnly = req.query.walk_ins_only === "true";
```

- [ ] **Step 2: Add `e.walk_in` to the geo SELECT (line 73–96)**

In the geo query's SELECT clause, add `e.walk_in` after `e.surprise_score`:

```sql
SELECT
  e.event_id, e.source, e.name, e.start_time, e.url,
  e.segment, e.genre, e.price_min, e.price_max, e.is_free,
  e.availability_tier, e.last_checked_at, e.surprise_score,
  e.walk_in,
  v.name        AS venue_name,
  v.address     AS venue_address,
  v.neighborhood,
  v.geo_lat AS venue_lat,
  v.geo_lng AS venue_lng,
  0 AS distance_m
```

- [ ] **Step 3: Add `e.walk_in` to the non-geo SELECT (line 99–115)**

```sql
SELECT
  e.event_id, e.source, e.name, e.start_time, e.url,
  e.segment, e.genre, e.price_min, e.price_max, e.is_free,
  e.availability_tier, e.last_checked_at, e.surprise_score,
  e.walk_in,
  v.name        AS venue_name,
  v.address     AS venue_address,
  v.neighborhood
```

- [ ] **Step 4: Add post-filtering before rankEvents call (line 139)**

Replace `const ranked = rankEvents(events, ...)` with:

```js
let filterable = hasGeo ? events : rows;

if (budgetMax !== null) {
  filterable = filterable.filter((e) =>
    budgetMax === 0
      ? e.is_free
      : e.is_free || e.price_min == null || e.price_min <= budgetMax
  );
}
if (walkInsOnly) {
  filterable = filterable.filter((e) => e.walk_in === true);
}

const ranked = rankEvents(filterable, { sort, surpriseMe, budget }).slice(0, surpriseMe ? 5 : limit);
```

Note: when geo is present, `events` is the travel-enriched array; when not, it's `rows`. The variable `filterable` unifies them before filtering. Remove the old `events` / `rows` split in the `res.json` call — use `ranked` which now comes from `filterable`.

> **Important:** The existing code does `const events = hasGeo ? await Promise.all(...) : rows;` — you must capture this as `let filterable = hasGeo ? await Promise.all(...) : rows;` and remove the old `const events` declaration to avoid the duplicate.

- [ ] **Step 5: Verify server starts**

```bash
cd /Users/donniebolen/dev/NowGo && node src/server.js &
sleep 2
curl -s "http://localhost:3000/health" | grep ok
kill %1
```

Expected: `{"status":"ok",...}`

- [ ] **Step 6: Commit**

```bash
git add src/server.js
git commit -m "feat: add walk_ins_only + budget_max filtering to /events/tonight"
```

---

## Task 4: Install expo-linear-gradient

**Files:**
- Modify: `mobile/package.json` (auto)

- [ ] **Step 1: Install the package**

```bash
cd mobile && npx expo install expo-linear-gradient
```

Expected: `expo-linear-gradient` appears in `package.json` dependencies.

- [ ] **Step 2: Verify import resolves**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors about missing `expo-linear-gradient` module.

- [ ] **Step 3: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "feat: add expo-linear-gradient for constraint bar fade effects"
```

---

## Task 5: TonightFeed — state + category row (Row 1)

**Files:**
- Modify: `mobile/src/screens/TonightFeed.tsx`

This task replaces the existing segment `FlatList` (Row 1) and sets up the new state fields. The budget row (Row 2) comes in Task 6.

- [ ] **Step 1: Replace imports and constants at top of file**

```tsx
import { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, RefreshControl, Modal, Switch,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import EventCard from "../components/EventCard";
import { fetchTonightEvents } from "../api/nowgo";
import type { Event } from "../types";

const CATEGORIES = [
  "All", "Jazz", "Music", "Comedy", "Theater",
  "Sports", "Art", "Outdoors", "Film", "Talks", "Nightlife", "Family",
];

const BUDGETS: { label: string; value: number | null }[] = [
  { label: "Free", value: 0 },
  { label: "<$25", value: 25 },
  { label: "<$50", value: 50 },
  { label: "<$100", value: 100 },
  { label: "Any", value: null },
];

const MODES = [
  { key: "transit" as const, emoji: "🚇", label: "Transit" },
  { key: "walk" as const,    emoji: "🚶", label: "Walk" },
  { key: "drive" as const,   emoji: "🚗", label: "Drive" },
];
const MODE_EMOJI: Record<string, string> = { transit: "🚇", walk: "🚶", drive: "🚗" };

const SORT_OPTIONS = [
  { key: "best" as const,     label: "Best Match" },
  { key: "soonest" as const,  label: "Soonest" },
  { key: "nearest" as const,  label: "Nearest" },
  { key: "cheapest" as const, label: "Cheapest" },
];

interface Props {
  navigation: NativeStackNavigationProp<any>;
}
```

- [ ] **Step 2: Replace component state declarations**

```tsx
export default function TonightFeed({ navigation }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);

  const [category, setCategory] = useState("All");
  const [budgetMax, setBudgetMax] = useState<number | null>(null);
  const [mode, setMode] = useState<"transit" | "walk" | "drive">("transit");
  const [sortBy, setSortBy] = useState<"best" | "soonest" | "nearest" | "cheapest">("best");
  const [walkInsOnly, setWalkInsOnly] = useState(false);

  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
```

- [ ] **Step 3: Update load callback**

```tsx
  const load = useCallback(async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      const data = await fetchTonightEvents({
        lat: location?.latitude,
        lng: location?.longitude,
        mode,
        segment: category,
        budgetMax,
        sortBy,
        walkInsOnly,
      });
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [location, category, mode, budgetMax, sortBy, walkInsOnly]);
```

- [ ] **Step 4: Replace Row 1 (category pills) in JSX**

```tsx
      {/* Row 1 — Category pills */}
      <View style={styles.categoryRowWrap}>
        <FlatList
          data={CATEGORIES}
          horizontal
          keyExtractor={(s) => s}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.chip, category === item && styles.chipActive]}
              onPress={() => setCategory(item)}
            >
              <Text style={[styles.chipText, category === item && styles.chipTextActive]}>
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
        <LinearGradient
          colors={["transparent", "#0A0A0A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.fadeRight}
          pointerEvents="none"
        />
        <Text style={styles.scrollArrow} pointerEvents="none">›</Text>
      </View>
```

- [ ] **Step 5: Add category row styles (merge into existing StyleSheet)**

```ts
  categoryRowWrap: { position: "relative" },
  chipRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: "center" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  chipActive: { backgroundColor: "#FF6B35", borderColor: "#FF6B35" },
  chipText: { color: "#9CA3AF", fontSize: 13, fontWeight: "500" },
  chipTextActive: { color: "#FFFFFF", fontWeight: "700" },
  fadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },
  scrollArrow: {
    position: "absolute",
    right: 6,
    top: "50%",
    color: "#6B7280",
    fontSize: 18,
    marginTop: -10,
  },
```

- [ ] **Step 6: TypeScript check**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/TonightFeed.tsx
git commit -m "feat: add constraint bar Row 1 — 12-category scrollable pills"
```

---

## Task 6: TonightFeed — Row 2 (budget chips + mode picker + filter button)

**Files:**
- Modify: `mobile/src/screens/TonightFeed.tsx`

- [ ] **Step 1: Replace old mode row JSX with Row 2**

Remove the old `{/* Mode + filter row */}` block and replace with:

```tsx
      {/* Row 2 — Budget chips + pinned buttons */}
      <View style={styles.budgetRow}>
        {/* Left: scrollable budget chips */}
        <View style={styles.budgetScrollWrap}>
          <FlatList
            data={BUDGETS}
            horizontal
            keyExtractor={(b) => b.label}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.budgetChipRow}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.budgetChip, budgetMax === item.value && styles.budgetChipActive]}
                onPress={() => setBudgetMax(item.value)}
              >
                <Text style={[styles.budgetChipText, budgetMax === item.value && styles.budgetChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
          <LinearGradient
            colors={["transparent", "#0A0A0A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.budgetFadeRight}
            pointerEvents="none"
          />
        </View>

        {/* Right: pinned mode + filter buttons */}
        <View style={styles.pinnedButtons}>
          {/* Mode button + inline picker */}
          <View>
            <TouchableOpacity
              style={styles.modeButton}
              onPress={() => setModePickerOpen((v) => !v)}
            >
              <Text style={styles.modeButtonText}>{MODE_EMOJI[mode]} ▾</Text>
            </TouchableOpacity>
            {modePickerOpen && (
              <View style={styles.modePicker}>
                {MODES.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={styles.modePickerItem}
                    onPress={() => { setMode(m.key); setModePickerOpen(false); }}
                  >
                    <Text style={styles.modePickerText}>{m.emoji} {m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Filter button */}
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setFilterSheetOpen(true)}
          >
            <View style={styles.filterIconWrap}>
              <View style={[styles.filterLine, { width: 14 }]} />
              <View style={[styles.filterLine, { width: 10 }]} />
              <View style={[styles.filterLine, { width: 6 }]} />
            </View>
          </TouchableOpacity>
        </View>
      </View>
```

- [ ] **Step 2: Add Row 2 styles**

```ts
  budgetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 8,
  },
  budgetScrollWrap: { flex: 1, position: "relative" },
  budgetChipRow: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  budgetChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  budgetChipActive: { backgroundColor: "#F5A623", borderColor: "#F5A623" },
  budgetChipText: { color: "#9CA3AF", fontSize: 13, fontWeight: "500" },
  budgetChipTextActive: { color: "#111111", fontWeight: "700" },
  budgetFadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 32,
  },
  pinnedButtons: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
    gap: 8,
  },
  modeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  modeButtonText: { color: "#FFFFFF", fontSize: 13 },
  modePicker: {
    position: "absolute",
    top: 36,
    right: 0,
    backgroundColor: "#1C1C1C",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    zIndex: 100,
    minWidth: 110,
    overflow: "hidden",
  },
  modePickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modePickerText: { color: "#FFFFFF", fontSize: 14 },
  filterButton: {
    padding: 8,
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    justifyContent: "center",
    alignItems: "center",
  },
  filterIconWrap: { gap: 3, alignItems: "flex-start" },
  filterLine: { height: 1.5, backgroundColor: "#9CA3AF", borderRadius: 1 },
```

- [ ] **Step 3: TypeScript check**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/TonightFeed.tsx
git commit -m "feat: add constraint bar Row 2 — budget chips, mode picker, filter button"
```

---

## Task 7: TonightFeed — Filter bottom sheet

**Files:**
- Modify: `mobile/src/screens/TonightFeed.tsx`

- [ ] **Step 1: Add Modal JSX inside the root `<View style={styles.container}>`**

Add before the closing `</View>`:

```tsx
      {/* Filter bottom sheet */}
      <Modal
        visible={filterSheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setFilterSheetOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => setFilterSheetOpen(false)}
            activeOpacity={1}
          />
          <View style={styles.sheet}>
            {/* Sort By */}
            <Text style={styles.sheetHeading}>Sort By</Text>
            <View style={styles.sortGrid}>
              {SORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sortOption, sortBy === opt.key && styles.sortOptionActive]}
                  onPress={() => setSortBy(opt.key)}
                >
                  <Text style={[styles.sortOptionText, sortBy === opt.key && styles.sortOptionTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Availability */}
            <Text style={styles.sheetHeading}>Availability</Text>
            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleLabel}>Walk-ins only</Text>
                <Text style={styles.toggleSub}>No ticket required</Text>
              </View>
              <Switch
                value={walkInsOnly}
                onValueChange={setWalkInsOnly}
                trackColor={{ false: "#2A2A2A", true: "#FF6B35" }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#2A2A2A"
              />
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={styles.showResultsBtn}
              onPress={() => setFilterSheetOpen(false)}
            >
              <Text style={styles.showResultsText}>Show results</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
```

- [ ] **Step 2: Add bottom sheet styles**

```ts
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
```

- [ ] **Step 3: TypeScript check**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/TonightFeed.tsx
git commit -m "feat: add filter bottom sheet with sort grid and walk-ins toggle"
```

---

## Task 8: Count label bug fix + style cleanup

**Files:**
- Modify: `mobile/src/screens/TonightFeed.tsx`

- [ ] **Step 1: Fix count label in ListHeaderComponent**

Find the `<Text style={styles.countLabel}>` in `ListHeaderComponent` and add the missing props:

```tsx
<Text
  style={styles.countLabel}
  numberOfLines={1}
  ellipsizeMode="tail"
>
  {events.length} events tonight
  {location ? " · near you" : " · NYC"}
</Text>
```

- [ ] **Step 2: Remove dead styles from StyleSheet**

Delete these style rules that no longer exist in the JSX:
- `chipList` (the FlatList `style` prop is gone; use `categoryRowWrap` instead)
- `modeRow`, `modeChip`, `modeChipActive`, `modeText`, `modeTextActive`

Keep `countLabel`, `listContent`, `errorText`, `retryBtn`, `retryText`, `emptyText`, `container`, `center`.

- [ ] **Step 3: Final TypeScript check**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/TonightFeed.tsx
git commit -m "fix: count label truncation + remove dead mode-row styles"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| 12 categories, horizontal scroll, orange active pill | Task 5 |
| Right-edge fade gradient + `›` arrow | Task 5 |
| Budget chips (Free/<$25/<$50/<$100/Any), gold active | Task 6 |
| Mode button (emoji + ▾), inline 3-up picker | Task 6 |
| Filter button (3-line descending icon) | Task 6 |
| Filter sheet: Sort 2×2, Walk-ins toggle, Show results CTA | Task 7 |
| Count label truncation bug fix | Task 8 |
| State: category, budgetMax, mode, sortBy, walkInsOnly | Task 5 |
| API: budget_max, sort, walk_ins_only params | Task 2 |
| Backend: walk_ins_only + budget_max filtering | Task 3 |
| Out-of-scope items not implemented | — |

### Out-of-Scope Confirmed Not Implemented
- Time window filter
- Filter state persistence
- Active badge on filter button

### Type Consistency Check
- `mode`: `"transit" | "walk" | "drive"` — used consistently in state (Task 5), type (Task 1), API map (Task 2)
- `sortBy`: `"best" | "soonest" | "nearest" | "cheapest"` — consistent across type, state, SORT_OPTIONS array
- `budgetMax`: `number | null` — consistent across type, state, BUDGETS array values
- `SORT_OPTIONS[n].key` matches `sortBy` type literals — ✓
- `MODES[n].key` matches `mode` type literals — ✓

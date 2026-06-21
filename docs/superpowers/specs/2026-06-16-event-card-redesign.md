# Event Card Redesign — Design Spec

**Date:** 2026-06-16  
**Task:** 86b9wfdyf — Build results list with event cards + availability badges  
**Status:** Design approved, pending implementation

---

## Overview

Redesign `EventCard.tsx` from its current single-row layout to a structured two-section card with a fixed-height 2-row metadata pill. The goal is visual consistency across a feed where event names, hooks, and contextual labels vary wildly in length.

---

## Layout Structure

```
┌──────────────────────────────────────────────┐
│ ● Event Name (bold, max 2 lines)             │
│   🎷 Venue Name · Neighborhood               │
│   "LLM-generated hook in italics"            │  ← hidden if null
│ ┌────────────────────────────────────────┐   │
│ │ $35 · 8:00 PM          ✅ Available   │   │  ← Row 1
│ │────────────────────────────────────────│   │
│ │ Starts in 40 min…        Leave by 7:43│   │  ← Row 2
│ └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

---

## Top Section

| Element | Details |
|---|---|
| Category dot | 8×8pt colored circle, `flex-shrink:0`, aligned to top of name |
| Event name | `fontSize:16`, `fontWeight:600`, `numberOfLines:2` |
| Venue line | Emoji + venue name + `·` + neighborhood, `fontSize:13`, muted gray |
| Hook | LLM-generated one-liner, italic, `fontSize:13`, lighter gray, hidden if `hook` is null/undefined |

### Category dot colors

| Segment | Color |
|---|---|
| Music / Jazz | `#F59E0B` (amber) |
| Sports | `#3B82F6` (blue) |
| Arts & Theatre / Comedy | `#8B5CF6` (purple) |
| Outdoors / Family | `#10B981` (green) |
| Film / Talks / Nightlife | `#EC4899` (pink) |
| Default | `#6B7280` (gray) |

### Venue emoji map

| Genre/Segment | Emoji |
|---|---|
| Music / Jazz | 🎷 |
| Sports | 🏆 |
| Comedy | 🎤 |
| Arts / Theatre | 🎭 |
| Film | 🎬 |
| Outdoors | 🌳 |
| Nightlife | 🌙 |
| Default | 📍 |

---

## Bottom Metadata Pill

A `background:#141414` rounded pill (`borderRadius:8`) with two fixed-height rows separated by a 1px divider (`#1F2937`).

### Row 1 — Price · Time · Badge

`justifyContent: space-between`, single line, never wraps.

**Left:** `$XX` (white, bold) `·` `H:MM PM` (muted gray)  
- Free events: `FREE` in green instead of price  

**Right:** Availability badge (always `flex-shrink:0`)

#### Availability badge variants

| `availability_tier` | Label | Colors |
|---|---|---|
| `available` | `✅ Available` | bg `#14532d`, text `#4ade80` |
| `limited` | `⚠️ Limited` | bg `#422006`, text `#fb923c` |
| `walk_in` / `walk_in_only` | `🚶 Walk-in` | bg `#1e3a5f`, text `#93c5fd` |
| `sold_out` | `🚫 Sold Out` | bg `#1F1F1F`, text `#6B7280` |
| default | `📅 Check` | bg `#1F1F1F`, text `#6B7280` |

### Row 2 — Contextual Label · Leave By

`justifyContent: space-between`, single line, divider above.

**Left:** Contextual time label — `flex:1`, `numberOfLines:1`, `ellipsizeMode:"tail"`, blue (`#60a5fa`), `fontSize:11`  
**Right:** Leave-by display — `flex-shrink:0`, `marginLeft:8`, `fontSize:12`, `fontWeight:600`

#### Contextual time label logic (left side)

| Condition | Label |
|---|---|
| `travel_minutes` is null | `"Time unknown"` |
| Event underway (`start_time` < now) and < 2hrs in | `"Started X min ago — still worth going"` |
| Event underway > 2hrs | `"Underway"` |
| `leave_by` < now | `"Should have left already"` (muted, not blue) |
| `travel_minutes` ≤ 10 | `"Just X min away"` |
| `travel_minutes` until start < 60 | `"Starts in X min"` |
| `travel_minutes` until start ≥ 60 | `"Starts in Xh Ym"` |

#### Leave-by display logic (right side)

| Condition | Display | Color |
|---|---|---|
| `leave_by` is null | hidden (empty string) | — |
| Event sold out | `"No travel needed"` | muted gray |
| `leave_by` < now − 5min | `"Underway"` | muted gray |
| `leave_by` ≤ now | `"⚡ Leave NOW"` | `#EF4444`, bold |
| `leave_by` within 30min | `"Leave in Xm"` | `#22C55E` |
| Default | `"Leave by H:MM"` | `#22C55E` |

---

## Sold-Out Card State

When `availability_tier === "sold_out"`:
- Entire card rendered at `opacity:0.7`
- Event name and venue text use muted colors
- Row 2 right side shows `"No travel needed"` in gray instead of leave-by

---

## Hook Field

The `hook` field is an LLM-generated one-liner describing the event's personality (e.g. `"NYC's most storied jazz room, intimate and electric tonight"`).

- **Type:** `string | null` — add to `Event` interface in `src/types/index.ts`
- **Render:** Italic, `fontSize:13`, `color:#9CA3AF`, `numberOfLines:2`
- **Fallback:** If `null` or empty string, render nothing (no placeholder text, no empty line)

---

## Animation

Staggered entrance on feed load: each card fades in and slides up 12pt with a 60ms delay per index (index × 60ms). Use React Native `Animated.Value` starting at `opacity:0`, `translateY:12`.

---

## Files to Change

| File | Change |
|---|---|
| `src/types/index.ts` | Add `hook?: string \| null` to `Event` interface |
| `src/components/EventCard.tsx` | Full rewrite per this spec |
| `src/screens/TonightFeed.tsx` | Pass stagger index to `EventCard` for animation |

---

## Out of Scope

- Backend `hook` field population (separate backend task)
- Tap-to-detail navigation (future task)
- Image/photo support on cards

# Late-Night Inventory — Problem Spec

**Date:** 2026-08-03
**Status:** Draft for discussion. Not scheduled — sequencing depends on the partnership backlog.

## Summary

NowGo's premise is "what can I go do *right now*." Today the app cannot answer that
question after roughly 8pm, because it has almost no genuine late-night inventory.
This is currently disguised by a time-parsing bug that makes jazz events look like
they run at midnight.

Two separate problems are tangled together here and should be treated separately:

1. **A data bug** — jazz start times are all wrong (fixable now, small)
2. **An inventory gap** — there is nearly nothing to show late at night (structural, needs new sources or partnerships)

Fixing (1) will make (2) *look* worse, because the fake midnight events disappear.
That is the correct outcome, but worth expecting.

## Evidence

Event start times, by hour and source, for the next 7 days:

| Hour (ET) | Ticketmaster | SeatGeek | Jazz | Note |
|---|---|---|---|---|
| 00:00 | 0 | 0 | 14 | all mistimed — see below |
| 13:00–18:00 | 12 | 0 | 0 | matinees, scattered |
| **19:00** | **37** | **18** | 0 | the entire evening, in one hour |
| 20:00 | 0 | 2 | 0 | |
| 21:00+ | **0** | **0** | **0** | nothing |

Total upcoming inventory: **83 events**.

Three findings:

- **Everything is a 7pm curtain.** 55 of 83 events start at 19:00. Ticketed
  entertainment on Ticketmaster and SeatGeek is overwhelmingly a fixed evening
  showtime.
- **There is genuinely zero inventory after 8pm.** Not thin — zero.
- **Every jazz event is timestamped 00:00 ET.** The time parser in
  `src/fetchers/jazz-nyc.js` is failing on every row. Real jazz sets run 7:30,
  9:00, 10:30 and midnight, so this is both wrong *and* the only reason the
  late-night feed looks populated at all.

A related finding while measuring this: **`walk_in` is `false` on all 83 events**,
so the "walk-ins only" filter in the app currently returns an empty list every
time. Walk-in inventory is exactly what late-night needs, so these are the same
problem.

## Why the gap exists

Late-night NYC is bars, clubs, comedy sets, DJ nights and jam sessions. Almost
none of that sells through Ticketmaster or SeatGeek, which are built around
reserved-seat, advance-purchase events. The two sources carrying our catalog are
structurally incapable of covering the hours the app is named after.

So this is not a bug to fix in the pipeline. It needs different supply.

## Options

Ordered by effort. The first is worth doing regardless of the rest.

### 1. Fix jazz time parsing — small, do this first

`parseTime()` in `src/fetchers/jazz-nyc.js` returns null for every row, and the
value falls through to midnight. The source table has a time column, so the data
is there.

This alone unlocks real late-night inventory: jazz clubs are one of the few
categories that genuinely programs 9pm–1am, and Smalls, Mezzrow, Cellar Dog and
Zinc Bar all run late sets. Worth doing before any source work, because it may
turn out we already have more late-night coverage than we can currently see.

**Expect the feed to get emptier at 10pm once this lands**, since the fake
midnight events stop qualifying.

### 2. Late-night-native sources — medium, no partnership needed

Candidates, roughly in order of fit:

- **Comedy clubs.** Comedy Cellar, Village Underground, Stand NYC — 9pm/11pm
  shows, often walk-in, and a natural fit for the app's tone. Mostly venue-direct
  scraping.
- **Nightlife / DJ listings.** Resident Advisor and Dice cover exactly the
  10pm–4am window that is currently empty. Both have structured data.
- **Venue-direct for the jazz clubs we already resolved.** We now store
  `venues.website` for 28 venues, several of which publish their own full
  schedules with real set times — better data than the aggregator table we
  currently scrape.

Note the archived fetchers (`src/fetchers/Archive/`: eventbrite, bandsintown,
nyc-parks, ticketsdata) were retired for dead APIs, not for lack of relevance.
Eventbrite in particular carries late-night and walk-in inventory and may be
worth revisiting.

### 3. Populate walk-in data — small to medium

The `walk_in` field exists and is wired through to a filter in the app, but
nothing sets it. Late-night discovery is mostly "can I just show up," so this
field is more valuable after dark than any other. Likely derivable from venue
type plus price data rather than needing a new source.

### 4. Partnerships — largest, already on the backlog

Direct venue relationships are the only route to inventory that is both
late-night and reliably accurate. Explicitly out of scope here; noted so the
sequencing is visible.

## Product options that need no new inventory

Worth considering in parallel, since they change what "empty" feels like:

- **Time-aware window.** The feed currently cuts off at 4am and only looks
  forward 30 minutes back. Late at night it could roll into tomorrow's early
  events rather than showing nothing.
- **"Still going."** Events already underway that are still worth joining — a
  jazz set two hours in is often still a good answer to "what now." Currently
  filtered out by `start_time > NOW() - 30 minutes`.
- **Honest empty state.** If there is genuinely nothing at 1am, saying so with a
  nudge toward tomorrow is better than an empty list. Cheap, and it makes the
  gap survivable while supply is being built.

## Recommendation

**Before launch:** fix jazz time parsing (#1). It is small, it is a correctness
bug rather than a feature, and shipping mistimed events is worse than shipping
fewer events. Pair it with the honest empty state so late-night users get a real
answer instead of a blank screen.

**After the partnership backlog settles:** take #2 in the order listed —
comedy first, since it is closest to the existing model and needs no
relationship, then nightlife listings.

**Do not** attempt to close the 9pm–2am gap with more Ticketmaster/SeatGeek
coverage. The data shows the ceiling: those sources are a 7pm business.

## Open questions

- What is the right late-night window — does "tonight" end at 4am, or roll into
  the next day?
- Should events already underway appear, and how should they be labeled?
- Is comedy or nightlife the better second source, given the target user?

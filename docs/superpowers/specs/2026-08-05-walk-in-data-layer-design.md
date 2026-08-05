# Walk-In Data Layer — Design

**Date:** 2026-08-05
**Status:** Draft for review
**Supersedes the approach in:** ClickUp `86b9wfdnt` — "Manual curation: top 20 NYC walk-in venues" (keeps its shape, changes its data model — see *Divergences*)

## Problem

`events.walk_in` exists (`db/migrations/007_walk_in.sql`), defaults `FALSE`, and is **never written by any code**. The `INSERT INTO events (...)` column list in `db/ingest.js` does not include it, so no fetcher could ever have set it.

`src/server.js` reads it and filters on it when `walk_ins_only=true`. The app exposes that as a toggle in `FilterSheet`. The filter therefore returns an empty list every time — a dead control shipping in the TestFlight build.

Walk-in inventory matters disproportionately for NowGo: spontaneity is the product's premise, and walk-in venues are most of what is actually reachable late at night.

## Evidence

Research across Eventbrite, Ticketmaster, DICE, Resident Advisor, Meetup, Songkick and schema.org found one consistent pattern: **price and advance-requirement are always modeled as separate axes, never one boolean.** Eventbrite splits ticket type (`free`/`paid`/`donation`) from sales channel (`online`/`atd`). schema.org expects a `price: "0"` Offer for free events that still require registration. There is no industry-standard term for "free but requires advance RSVP" — it is a genuine vocabulary gap.

Confirmed in our own data: both `is_free` events carry real TicketWeb ticket URLs. Free does not imply walk-in.

Venue research on the seven NYC jazz clubs we care about:

| Venue | Advance | Walk-in reality |
|---|---|---|
| Cellar Dog | none | Walk-in only, $5–10 cover |
| Arthur's Tavern | none enforced | Walk-in, no cover, $15 min spend |
| Smalls | $35–40 reserved | Yes, **$25 at the door**, space permitting |
| Mezzrow | up to $35 | Yes, **$25**, weeknights easier |
| Blue Note | required for tables | Bar area is walk-in, first-come |
| Village Vanguard | strongly recommended | Standby line only, not guaranteed |
| Birdland | effectively required | Own FAQ is silent; sources conflict |

**Hybrid is the modal case.** Most of these venues sell advance tickets *and* admit walk-ins, at a different price. A boolean cannot express any of them correctly.

## Design

### Schema

```sql
-- db/migrations/009_venue_walk_in.sql
ALTER TABLE venues ADD COLUMN IF NOT EXISTS walk_in_policy TEXT
  CHECK (walk_in_policy IN ('always','space_permitting','standby','none','unknown'))
  DEFAULT 'unknown';

ALTER TABLE venues ADD COLUMN IF NOT EXISTS door_price NUMERIC(6,2);
```

Venue-level, per the ClickUp task. Keyed by `venue_id`, so alias resolution in `db/ingest.js` applies automatically and events inherit whatever their canonical venue carries.

`walk_in_policy` values, in decreasing reliability:

- `always` — no advance option; you show up (Cellar Dog, Arthur's Tavern)
- `space_permitting` — advance tickets exist, walk-ins admitted if there's room (Smalls, Mezzrow, Blue Note)
- `standby` — walk-ins queue with no guarantee (Village Vanguard)
- `none` — advance purchase genuinely required
- `unknown` — not yet curated. **The default, and it means "we don't know," not "no."**

`door_price` is the **walk-in** price, which differs from the advance price ($25 vs $35 at Smalls). It is deliberately not merged into `price_min`.

### Seeding

Seed data lives in the migration, matched on `lower(name)` following the pattern in `002_venue_aliases.sql`.

**Critical constraint:** `db/migrate.js` re-runs *every* migration file on *every* run. A plain `UPDATE` would revert manual curation on the next deploy. Every seed statement is therefore guarded:

```sql
UPDATE venues SET walk_in_policy = 'space_permitting', door_price = 25.00
 WHERE lower(name) = 'smalls' AND walk_in_policy = 'unknown';
```

The `AND walk_in_policy = 'unknown'` guard means the seed only ever fills a gap. Once a human curates a venue, re-running migrations leaves it alone.

Only the seven researched venues are seeded. Every other venue stays `unknown` until curated — that is the honest state, and populating the remaining entries is the human work the ClickUp task describes. A curator adds one with a plain `UPDATE`; no deploy required.

### Read path

Which policies count as "walk-in" is defined **once**, in `src/services/walk-in.js`, and interpolated into SQL — the same pattern `EVENT_URL_SQL` already uses in `src/server.js:18`, so the rule cannot drift between the query and the application:

```js
export const WALK_IN_QUALIFYING = ["always", "space_permitting"];
export function qualifiesAsWalkIn(policy) { ... }
export const WALK_IN_SQL = `v.walk_in_policy IN (...)`;
```

`src/server.js` stops reading the dead `e.walk_in` column and derives the flag from the venue, in both `/events/tonight` query variants and `/events/:id`:

```sql
${WALK_IN_SQL} AS walk_in,
v.walk_in_policy,
v.door_price
```

`standby` is excluded — a queue with no guarantee is not something to promise a user who filtered for walk-ins.

`src/services/walk-in.js` also holds `reportUncuratedVenues(pool)` for the curation signal below, mirroring the shape of `src/services/geocode.js`: pure, testable logic plus one `pool`-taking runner.

The response field keeps the name `walk_in` and stays a boolean, so **the existing TestFlight build needs no rebuild**: the filter starts working against the app already on the phone. `walk_in_policy` and `door_price` ride along for the app to use in a later build.

The `walk_ins_only` filter logic at `src/server.js:162-164` is unchanged in shape.

### Curation signal

After the pipeline runs, log venues that have events but no curation:

```
🚶 12 venues need a walk-in decision: Jazzcultural, Bar Bayeux, ...
```

Without this, a new venue silently defaults to `unknown` and never enters the filter, with nothing surfacing that a decision is owed. This mirrors how `geocodeVenues` logs `⚠️ No NYC match for X`.

### Not in scope

- **`availability_tier` is not touched.** Walk-in is an entry mechanism; availability is inventory confidence. Merging them would render an unverified jazz set as "✅ Available" and leak it into `surpriseMe`, which filters on verified tiers.
- **Ranking is unchanged.** Jazz keeps its `unknown` tier and its scoring penalty. Revisiting the 90-minute time cliff in `scoreEvent` is deferred by explicit decision.
- **App UI is deferred.** `EventDetail`'s walk-in note is gated on `event.url` being falsy and is unreachable; `eventCardHelpers.ts` has orphaned `walk_in` / `walk_in_only` badge entries no backend value has ever produced. Both wait for the next app build.
- **`events.walk_in` column is retained but unread.** Dropping it is a later migration once nothing depends on it.
- **`door_price` is not wired into `price_min`.** Door and advance prices are different concepts; conflating them would corrupt the budget filter. It is exposed in the API and inert until the app reads it.

## Divergences from prior direction

**From ClickUp `86b9wfdnt`:** that task specifies `walk_in=true` plus typical door price. Research showed a boolean misrepresents most target venues — Smalls sells advance tickets, Blue Note's bar takes walk-ins. The shape (venue-level, curated seed data, door price) is kept; the boolean becomes a five-value policy.

**From the architecture review:** it recommended curated data *plus* an inference pass for uncurated venues. Inference is dropped entirely. The proposed inference read raw `events.url`, where every jazz event carries the identical generic `jazz-nyc.com` value, so it could not distinguish Blue Note from Smalls. The consequence is accepted and explicit: an uncurated venue never appears in the filter, which the curation signal above is designed to surface.

**Carried forward, not addressed here:** `availability_tier`'s CHECK constraint permits only `available, scarce, sold_out, cancelled, unknown`, while `src/services/availability.js` writes `'limited'` and `'unverified'`. Those writes would be rejected today; they do not fail only because that service short-circuits on missing TicketsData credentials. Tracked separately.

## Failure modes

- **Admission varies by show.** A Saturday headliner at Smalls behaves differently from a Tuesday local act. A venue-level policy will be wrong for some events. Accepted for now; `space_permitting` is deliberately hedged language rather than a promise.
- **Reservation listings can be vestigial.** Arthur's Tavern has a live Resy listing but is reported walk-in-only in practice. Curation must reflect ground truth, not the presence of a booking integration.
- **Silence is not confirmation.** Birdland's FAQ says nothing about walk-ins. It stays `unknown` rather than being guessed either way.
- **Venue name drift.** Seeds match `lower(name)`. Venues that arrive under a variant spelling won't match until aliased. "Birdland Jazz Club" and "Birdland Theater" are separate physical rooms and are seeded separately.
- **Stale curation.** A venue that changes policy stays wrong until a human updates it. There is no expiry; the curation signal only reports `unknown`, not stale.

## Testing

New file `src/services/walk-in.test.js`, added to the `test` script in `package.json` — test files are listed explicitly there and a new file silently never runs otherwise.

- `qualifiesAsWalkIn` returns true for `always` and `space_permitting`, false for `standby`, `none`, `unknown`, and for null/unexpected values.
- `WALK_IN_QUALIFYING` and the values in the migration's `CHECK` constraint agree — a policy value that the schema allows but the predicate has never heard of is exactly how these two drift apart.
- The `CHECK` constraint accepts every value the code writes (the `availability_tier` drift above is precedent for this being a real risk).
- Seeding is idempotent: running the migration twice produces identical rows.
- Seeding does not clobber curation: set a venue to `none` by hand, re-run migrations, confirm it is still `none`.
- The derived `walk_in` boolean is true for `always` and `space_permitting`, false for `standby`, `none` and `unknown`.
- `walk_ins_only=true` returns exactly the events at qualifying venues.
- `door_price` is exposed in the API response and `price_min` is unchanged by this work.

Existing coverage: 56 backend tests across `seatgeek`, `jazz-nyc` and `geocode`. `ranking.js`, `ingest.js` and `server.js` have none — out of scope here, but `ranking.js` decides what users actually see and is worth covering next.

## Open question for review

The initial seed covers seven venues. The ClickUp task targets twenty, spanning comedy clubs, NYC Parks series, theater rush programs and museum free nights. We have no sources for any of those categories, so seeding them now would create rows matching zero events. The schema supports them whenever those sources exist.

# Tomorrow night — design

Approved in conversation 2026-10-01. Ships across backend (first) and build 12 (app).

## Why

A tester who opens NowGo late — say from a Reddit link at 11pm — sees an
almost empty feed: the tonight window drops anything that started more than
30 minutes ago. Build 12 is the tester-recruiting release, so that first
impression matters. Tomorrow night also lets people plan ahead.

## What the user sees

- A **Tonight / Tomorrow** switch at the top of the feed. Category, budget,
  walk-in and sort filters apply to whichever night is selected.
- **Auto-switch:** when the feed opens after 10pm ET and fewer than 5 events
  remain tonight, it opens on Tomorrow with a one-line notice:
  "Only N things left tonight. Showing tomorrow night." One tap goes back.
  If tonight has 0 left, the notice says "Nothing left tonight."
- **Tomorrow cards** show "Tomorrow 8:00 PM" where tonight's cards show the
  leave-by. No leave-by, no "starts in".
- **Event screen for a tomorrow event:** no travel-mode picker and no
  leave-by; Add to Calendar is the primary action (it already falls back to
  a 30-minutes-before reminder when there is no leave-by). Share says
  "tomorrow night" instead of "tonight".
- **Surprise Me** is hidden on Tomorrow — it means "the next 30–90 minutes".

## Definitions — one source of truth

`src/services/tonight-window.js` gains `nightBounds(night, now)` returning
`{ start, end }` instants, with `night` = `"tonight" | "tomorrow"`:

- An "evening" runs 5pm ET to 4am ET the next morning.
- **Current evening** = the evening containing `now`, or, between 4am and
  5pm, the evening starting at 5pm today. Before 4am it is the evening that
  started yesterday (as `tonightWindow()` already does).
- **tonight** = `now − 30 min` to the current evening's 4am end. Unchanged
  from today's lower bound, so a 2pm matinee still shows at 8am.
- **tomorrow** = the evening after the current one, 5pm to 4am.

The SQL window is passed these bounds as parameters instead of computing
its own. This also fixes the existing after-midnight mismatch:
`TONIGHT_WINDOW_SQL` currently extends to 4am the *following* day after
midnight, which the fetchers never covered.

Every consumer of `TONIGHT_WINDOW_SQL` (server.js, alternatives.js) moves
to the parameterized form, so alternatives for a tomorrow event come from
tomorrow.

## Backend

- **Fetch window:** Ticketmaster and SeatGeek fetch from the current
  evening's 5pm through the *tomorrow* evening's 4am — one request range,
  `fetchWindow(now)`. Expected volume about 300 Ticketmaster events, well
  under the 1,000-result paging cap. jazz-nyc already fetches today and
  tomorrow; it switches to the same date logic so all three agree after
  midnight.
- **Enrichment** (geocode, embeddings, genre, surprise scores, hooks) runs
  over the extra events unchanged. Roughly doubles per-run API work.
- **API:** `GET /events/tonight?night=tomorrow`. Default `tonight`, so the
  shipped app is unaffected. With `night=tomorrow`:
  - travel enrichment is skipped (`travel_minutes`, `leave_by` null) —
    a leave-by from where you stand now is wrong for tomorrow, and it would
    spend Google Maps calls;
  - lat/lng still apply as the distance filter;
  - `surprise_me=true` is rejected with 400;
  - response includes `night: "tomorrow"`.
  - An unknown `night` value is a 400, not a silent default.
- **Tonight count for auto-switch:** the existing response's event count is
  enough; the app requests tonight first.

## App (build 12)

- `fetchTonightEvents` takes `night`.
- `TonightFeed` holds `night` state; the switch sits above the category row.
- Auto-switch logic is a pure function in `src/services/` (testable under
  `node --test`): `shouldOpenOnTomorrow(nowNyc, tonightCount)` → true when
  local hour ≥ 22 or < 4, and `tonightCount < 5`.
- `EventCard` / `EventDetail` render the tomorrow variant when the event's
  start is in the tomorrow evening (passed down as a prop, not re-derived).
- `shareMessage` takes the night so the text says "tomorrow night".
- Analytics: `feed_loaded` gains `night`; new `night_switched`
  `{ to, auto }`.

## Testing

- `nightBounds` and `fetchWindow` unit tests at: 2pm, 6pm, 11:30pm, 1am,
  3:59am, 4:00am ET, and across both DST transitions.
- API: `night=tomorrow` returns no event before tomorrow 5pm, no travel
  fields, 400 for `surprise_me` and for an unknown night.
- App: `shouldOpenOnTomorrow` table test; share wording test.
- Before build 12: check the live feed at ~11pm that Tomorrow is populated
  from all three sources.

## Out of scope

"This weekend" or any day beyond tomorrow. Leave-by for future nights.

# Tomorrow Night Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the feed show tomorrow night's events, switched by a Tonight / Tomorrow toggle, and open on Tomorrow automatically late at night when tonight is nearly over.

**Architecture:** One module, `src/services/tonight-window.js`, becomes the only definition of both nights. It returns instants (`nightBounds`) that the SQL receives as parameters, plus the wider fetch range (`fetchWindow`) the fetchers use. `GET /events/tonight` gains `?night=tomorrow`. The app keeps the chosen night as state in `TonightFeed` and passes it down to cards and the detail screen as a prop.

**Tech Stack:** Node (ESM) + Express + Postgres (`pg`), `node --test`; Expo SDK 54 / React Native, TypeScript, `node --test` on `.ts` files (Node 26 type stripping).

**Spec:** `docs/superpowers/specs/2026-10-01-tomorrow-night-design.md`

## Global Constraints

- An "evening" runs 5pm ET to 4am ET the next morning. All "today in NYC" logic uses `America/New_York` explicitly. Railway runs UTC.
- **tonight** = `now − 30 min` to the current evening's 4am end. **tomorrow** = the evening after the current one, 5pm to 4am.
- `GET /events/tonight` defaults to `night=tonight`, so the shipped app is unaffected. An unknown `night` value is a 400. `night=tomorrow&surprise_me=true` is a 400.
- With `night=tomorrow`: no travel enrichment (`travel_minutes`, `leave_by` null), lat/lng still apply as the distance filter, and the response includes `night: "tomorrow"`.
- Auto-switch: open on Tomorrow when the NYC hour is ≥ 22 or < 4 **and** tonight has fewer than 5 events.
- Notice copy: `"Only N things left tonight. Showing tomorrow night."` When N is 0: `"Nothing left tonight. Showing tomorrow night."`
- Tomorrow cards show `"Tomorrow 8:00 PM"` where tonight's cards show the leave-by. No leave-by, no "starts in".
- Surprise Me is hidden on Tomorrow.
- Analytics: `feed_loaded` gains `night`; new event `night_switched` `{ to, auto }`.
- Out of scope: any day beyond tomorrow; leave-by for future nights.
- New test files only run once they are added to the `test` script in the matching `package.json`.
- Backend ships first. No DB migration is needed. The app change goes into build 12.
- Mobile: run everything from `mobile/`. Check with `npm test` and `npx tsc --noEmit`.

## Review Focus

1. **After midnight (00:00–03:59 ET).** "Tonight" must still mean the evening that started yesterday, ending at 4am today, not 4am tomorrow. "Tomorrow" must be today at 5pm. Pinned in Task 1 (1am and 3:59am cases) and Task 2 (jazz dates at 1am).
2. **DST nights.** A window that crosses a DST change must still end at 4am local time, not an hour off. Pinned in Task 1 (fall-back and spring-forward cases).
3. **A user outside NYC at 11pm.** Tonight is empty, so the feed auto-switches to Tomorrow, which is also empty. They must still get the "NowGo is NYC-only" message rather than "nothing tomorrow". The coverage probe has to pass `night`. Pinned in Task 7, step 2 (the probe call), and checked by hand in Task 8.
4. **Hooks for tomorrow's events.** Hook text is generated once and shown on both days, so it must never say "tonight" or "tomorrow". Pinned in Task 3.
5. **A sold-out tomorrow event.** Its alternatives must come from tomorrow, not tonight, and the share text must not say "tonight". Pinned in Task 4 (alternatives) and Task 5 (share).

---

## File map

Backend
- `src/services/tonight-window.js`: add `eveningDates`, `nightBounds`, `nightOf`, `fetchWindow`, `parseFeedNight`, `nightWindowSql`. Remove `tonightWindow` (Task 2) and `TONIGHT_WINDOW_SQL` (Task 4) once nothing uses them.
- `src/services/tonight-window.test.js`: tests for all of the above.
- `src/fetchers/ticketmaster.js`, `src/fetchers/seatgeek.js`: use `fetchWindow()`.
- `src/fetchers/jazz-nyc.js` (+ test): target dates come from `eveningDates()`.
- `src/services/hook-generation.js` (+ test): widen the candidate window to the end of tomorrow and drop day words from the prompt.
- `src/services/alternatives.js` (+ test): pass the window as parameters and choose the event's own night.
- `src/server.js`: the `night` param, parameterized window, travel skipped for tomorrow.

Mobile
- `mobile/src/types/index.ts`: `Night` type, plus `night` on params, response and route.
- `mobile/src/services/night.ts` (+ `night.test.ts`, new): `shouldOpenOnTomorrow`, `autoSwitchNotice`.
- `mobile/src/services/share.ts` (+ test): `night` param.
- `mobile/src/api/nowgo.ts`: send `night`.
- `mobile/src/components/eventCardHelpers.ts` (+ test): `tomorrowLabel`.
- `mobile/src/components/EventCard.tsx`: tomorrow variant.
- `mobile/src/screens/EventDetail.tsx`: tomorrow variant.
- `mobile/src/services/analytics.ts`: `feedLoaded` gains `night`; add `nightSwitched`.
- `mobile/src/screens/TonightFeed.tsx`: switch, auto-switch, notice, and Surprise Me hidden on Tomorrow.

Work on a branch: `git checkout -b feat/tomorrow-night`.

---

### Task 1: Night definitions in `tonight-window.js`

**Files:**
- Modify: `src/services/tonight-window.js`
- Test: `src/services/tonight-window.test.js`

**Interfaces:**
- Produces:
  - `NIGHTS: ["tonight", "tomorrow"]`
  - `eveningDates(now?: Date) → { tonight: {year, month, day}, tomorrow: {year, month, day} }`: the calendar dates whose 5pm starts each evening.
  - `nightBounds(night: "tonight"|"tomorrow", now?: Date) → { start: Date, end: Date }`: half-open `[start, end)`. Throws on an unknown night.
  - `nightOf(startTime: string|Date, now?: Date) → "tonight"|"tomorrow"`: `"tomorrow"` iff `startTime` falls inside `nightBounds("tomorrow", now)`.
  - `fetchWindow(now?: Date) → { localStart, localEnd, utcStart, utcEnd }`: the same shape `tonightWindow` returns, running from the current evening's 5pm to the tomorrow evening's 4am end.
  - `parseFeedNight({ night, surpriseMe }) → { night } | { status: 400, error: string }`
  - `nightWindowSql(startParam: string, endParam: string) → string`: e.g. `nightWindowSql("$6", "$7")` → `"e.start_time >= $6 AND e.start_time < $7"`. Assumes the events table is aliased `e`.

- [ ] **Step 1: Write the failing tests.** Append to `src/services/tonight-window.test.js` and extend the import line:

```js
import {
  tonightWindow, nycLocalToUtc,
  eveningDates, nightBounds, nightOf, fetchWindow, parseFeedNight, nightWindowSql,
} from "./tonight-window.js";

// All instants below are 2026-09-01/02 (EDT, UTC-4) unless noted.
const iso = (d) => d.toISOString();

test("nightBounds at 2pm: tonight runs from 30 min ago to 4am, tomorrow is the next evening", () => {
  const now = new Date("2026-09-01T18:00:00Z"); // 2pm EDT
  const t = nightBounds("tonight", now);
  assert.equal(iso(t.start), "2026-09-01T17:30:00.000Z");
  assert.equal(iso(t.end), "2026-09-02T08:00:00.000Z");
  const m = nightBounds("tomorrow", now);
  assert.equal(iso(m.start), "2026-09-02T21:00:00.000Z"); // Sep 2 5pm EDT
  assert.equal(iso(m.end), "2026-09-03T08:00:00.000Z");   // Sep 3 4am EDT
});

test("nightBounds at 6pm and 11:30pm agree on which evening is tomorrow", () => {
  for (const now of [new Date("2026-09-01T22:00:00Z"), new Date("2026-09-02T03:30:00Z")]) {
    assert.equal(iso(nightBounds("tonight", now).end), "2026-09-02T08:00:00.000Z");
    assert.equal(iso(nightBounds("tomorrow", now).start), "2026-09-02T21:00:00.000Z");
  }
});

test("after midnight, tonight still ends at 4am today, not 4am tomorrow", () => {
  // The old TONIGHT_WINDOW_SQL extended to 4am the *following* day here.
  for (const now of [new Date("2026-09-02T05:00:00Z"), new Date("2026-09-02T07:59:00Z")]) { // 1am, 3:59am
    assert.equal(iso(nightBounds("tonight", now).end), "2026-09-02T08:00:00.000Z");
    const m = nightBounds("tomorrow", now);
    assert.equal(iso(m.start), "2026-09-02T21:00:00.000Z"); // today 5pm
    assert.equal(iso(m.end), "2026-09-03T08:00:00.000Z");
  }
});

test("at 4:00am the evening rolls over", () => {
  const now = new Date("2026-09-02T08:00:00Z"); // 4am EDT
  assert.equal(iso(nightBounds("tonight", now).end), "2026-09-03T08:00:00.000Z");
  assert.equal(iso(nightBounds("tomorrow", now).start), "2026-09-03T21:00:00.000Z");
});

test("nightBounds across fall-back: the 4am end is EST", () => {
  // DST ends 2am ET on 2026-11-01. 11pm EDT Oct 31 == 03:00Z Nov 1.
  const now = new Date("2026-11-01T03:00:00Z");
  assert.equal(iso(nightBounds("tonight", now).end), "2026-11-01T09:00:00.000Z"); // 4am EST
  const m = nightBounds("tomorrow", now);
  assert.equal(iso(m.start), "2026-11-01T22:00:00.000Z"); // 5pm EST
  assert.equal(iso(m.end), "2026-11-02T09:00:00.000Z");
});

test("nightBounds across spring-forward: tomorrow starts EST and ends EDT", () => {
  // DST begins 2am ET on 2026-03-08. 9pm EST Mar 6 == 02:00Z Mar 7.
  const m = nightBounds("tomorrow", new Date("2026-03-07T02:00:00Z"));
  assert.equal(iso(m.start), "2026-03-07T22:00:00.000Z"); // Mar 7 5pm EST
  assert.equal(iso(m.end), "2026-03-08T08:00:00.000Z");   // Mar 8 4am EDT
});

test("nightBounds rejects an unknown night", () => {
  assert.throws(() => nightBounds("weekend", new Date()), /Unknown night/);
});

test("eveningDates after midnight belongs to the evening that started yesterday", () => {
  const d = eveningDates(new Date("2026-09-02T05:00:00Z")); // 1am Sep 2
  assert.deepEqual(d.tonight, { year: 2026, month: 9, day: 1 });
  assert.deepEqual(d.tomorrow, { year: 2026, month: 9, day: 2 });
});

test("eveningDates crosses a year boundary", () => {
  const d = eveningDates(new Date("2026-12-31T23:00:00Z")); // 6pm EST Dec 31
  assert.deepEqual(d.tomorrow, { year: 2027, month: 1, day: 1 });
});

test("nightOf places an event in tomorrow only inside tomorrow's bounds", () => {
  const now = new Date("2026-09-01T22:00:00Z"); // 6pm EDT Sep 1
  assert.equal(nightOf("2026-09-02T00:00:00Z", now), "tonight");  // 8pm Sep 1
  assert.equal(nightOf("2026-09-02T21:00:00Z", now), "tomorrow"); // 5pm Sep 2
  assert.equal(nightOf("2026-09-03T07:59:00Z", now), "tomorrow"); // 3:59am Sep 3
});

test("fetchWindow runs from this evening's 5pm through tomorrow evening's 4am", () => {
  const w = fetchWindow(new Date("2026-09-01T22:00:00Z")); // 6pm EDT
  assert.equal(w.localStart, "2026-09-01T17:00:00");
  assert.equal(w.localEnd, "2026-09-03T04:00:00");
  assert.equal(w.utcStart, "2026-09-01T21:00:00Z");
  assert.equal(w.utcEnd, "2026-09-03T08:00:00Z");
});

test("fetchWindow after midnight still starts at the current evening", () => {
  const w = fetchWindow(new Date("2026-09-02T05:00:00Z")); // 1am Sep 2
  assert.equal(w.localStart, "2026-09-01T17:00:00");
  assert.equal(w.localEnd, "2026-09-03T04:00:00");
});

test("parseFeedNight defaults to tonight", () => {
  assert.deepEqual(parseFeedNight({ night: undefined, surpriseMe: false }), { night: "tonight" });
  assert.deepEqual(parseFeedNight({ night: "", surpriseMe: false }), { night: "tonight" });
  assert.deepEqual(parseFeedNight({ night: "tomorrow", surpriseMe: false }), { night: "tomorrow" });
});

test("parseFeedNight rejects an unknown night rather than silently defaulting", () => {
  const r = parseFeedNight({ night: "Tomorrow", surpriseMe: false });
  assert.equal(r.status, 400);
  assert.match(r.error, /tonight, tomorrow/);
});

test("parseFeedNight rejects surprise_me for tomorrow", () => {
  // Surprise Me means "the next 30–90 minutes".
  const r = parseFeedNight({ night: "tomorrow", surpriseMe: true });
  assert.equal(r.status, 400);
});

test("nightWindowSql is a half-open range on the given placeholders", () => {
  assert.equal(nightWindowSql("$6", "$7"), "e.start_time >= $6 AND e.start_time < $7");
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**

Run: `node --test src/services/tonight-window.test.js`
Expected: FAIL, `eveningDates` is not exported.

- [ ] **Step 3: Implement.** Add the following to `src/services/tonight-window.js` after `tonightWindow`. Leave `tonightWindow` and `TONIGHT_WINDOW_SQL` in place for now, since the fetchers and SQL still use them until Tasks 2 and 4.

```js
// ─── TONIGHT AND TOMORROW ────────────────────────────────────────────────────
//
// An "evening" runs 5pm ET to 4am ET the next morning. The current evening is
// the one containing `now`, or, between 4am and 5pm, the one starting at 5pm
// today. "tonight" is what the feed has always served: from 30 minutes ago
// (a show that just started is still worth walking into) to the current
// evening's 4am end. "tomorrow" is the next evening, whole.
//
// These are instants handed to SQL as parameters. The SQL used to compute its
// own window, and after midnight it ran to 4am the *following* day, a stretch
// the fetchers never covered.

export const NIGHTS = ["tonight", "tomorrow"];

const GRACE_MS = 30 * 60 * 1000;

function addDays({ year, month, day }, n) {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + n);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const at = (date, hour) => nycLocalToUtc(date.year, date.month, date.day, hour);

// The calendar dates whose 5pm starts tonight's and tomorrow's evenings.
export function eveningDates(now = new Date()) {
  const nyc = partsInZone(now, NYC);
  const today = { year: nyc.year, month: nyc.month, day: nyc.day };
  const tonight = nyc.hour < WINDOW_END_HOUR ? addDays(today, -1) : today;
  return { tonight, tomorrow: addDays(tonight, 1) };
}

export function nightBounds(night, now = new Date()) {
  const { tonight, tomorrow } = eveningDates(now);
  if (night === "tonight") {
    return {
      start: new Date(now.getTime() - GRACE_MS),
      end: at(addDays(tonight, 1), WINDOW_END_HOUR),
    };
  }
  if (night === "tomorrow") {
    return {
      start: at(tomorrow, WINDOW_START_HOUR),
      end: at(addDays(tomorrow, 1), WINDOW_END_HOUR),
    };
  }
  throw new Error(`Unknown night: ${night}`);
}

// Which night an event belongs to. Used where the caller holds an event rather
// than a feed request, e.g. alternatives for a sold-out show.
export function nightOf(startTime, now = new Date()) {
  const t = new Date(startTime).getTime();
  const { start, end } = nightBounds("tomorrow", now);
  return t >= start.getTime() && t < end.getTime() ? "tomorrow" : "tonight";
}

// What the fetchers must go and get: both evenings, in one request range.
export function fetchWindow(now = new Date()) {
  const { tonight, tomorrow } = eveningDates(now);
  const end = addDays(tomorrow, 1);
  return {
    localStart: localStr(tonight.year, tonight.month, tonight.day, WINDOW_START_HOUR),
    localEnd: localStr(end.year, end.month, end.day, WINDOW_END_HOUR),
    utcStart: utcStr(at(tonight, WINDOW_START_HOUR)),
    utcEnd: utcStr(at(end, WINDOW_END_HOUR)),
  };
}

// Validates /events/tonight's `night` param. An unknown value is an error, not
// a silent default. A typo that quietly returned tonight would look like
// "tomorrow is broken".
export function parseFeedNight({ night, surpriseMe }) {
  const parsed = night == null || night === "" ? "tonight" : night;
  if (!NIGHTS.includes(parsed)) {
    return { status: 400, error: `night must be one of: ${NIGHTS.join(", ")}` };
  }
  if (parsed === "tomorrow" && surpriseMe) {
    return { status: 400, error: "surprise_me is only available for tonight" };
  }
  return { night: parsed };
}

// The window as SQL, on caller-chosen placeholders bound to nightBounds().
// Assumes the events table is aliased as `e`.
export function nightWindowSql(startParam, endParam) {
  return `e.start_time >= ${startParam} AND e.start_time < ${endParam}`;
}
```

- [ ] **Step 4: Run the tests and confirm they pass.**

Run: `node --test src/services/tonight-window.test.js`
Expected: PASS, both the old tests and the new ones.

- [ ] **Step 5: Commit.**

```bash
git add src/services/tonight-window.js src/services/tonight-window.test.js
git commit -m "feat(api): define tonight and tomorrow in one place"
```

---

### Task 2: Fetchers get both evenings

**Files:**
- Modify: `src/fetchers/ticketmaster.js:5,80`, `src/fetchers/seatgeek.js:6,223`, `src/fetchers/jazz-nyc.js:208-214`
- Modify: `src/services/tonight-window.js` (remove `tonightWindow`), `src/services/tonight-window.test.js` (remove its tests)
- Test: `src/fetchers/jazz-nyc.test.js`

**Interfaces:**
- Consumes: `fetchWindow`, `eveningDates` from Task 1.
- Produces: `jazzTargetDates(now?: Date) → Set<string>` exported from `jazz-nyc.js`, in the table's `MM/DD/YY` format.

- [ ] **Step 1: Write the failing test.** Append to `src/fetchers/jazz-nyc.test.js` and add `jazzTargetDates` to the import:

```js
test("jazzTargetDates is tonight's and tomorrow's evening, not today and tomorrow", () => {
  // 6pm EDT Sep 1
  assert.deepEqual([...jazzTargetDates(new Date("2026-09-01T22:00:00Z"))], ["09/01/26", "09/02/26"]);
});

test("jazzTargetDates after midnight still includes the evening in progress", () => {
  // 1am EDT Sep 2 is still Sep 1's evening, so all three sources agree.
  assert.deepEqual([...jazzTargetDates(new Date("2026-09-02T05:00:00Z"))], ["09/01/26", "09/02/26"]);
});
```

- [ ] **Step 2: Run the test and confirm it fails.**

Run: `node --test src/fetchers/jazz-nyc.test.js`
Expected: FAIL, `jazzTargetDates` is not exported.

- [ ] **Step 3: Implement.**

In `src/fetchers/jazz-nyc.js`, add the import `import { eveningDates } from "../services/tonight-window.js";` and, after `nycDateStr`:

```js
// The schedule dates to keep: the current evening and the next one, using the
// same evening logic as the ticketing fetchers. Calendar "today and tomorrow"
// disagrees with them after midnight, when today's date is already the next
// evening and the one still in progress falls out.
const tableDate = ({ year, month, day }) =>
  `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${String(year).slice(2)}`;

export function jazzTargetDates(now = new Date()) {
  const { tonight, tomorrow } = eveningDates(now);
  return new Set([tableDate(tonight), tableDate(tomorrow)]);
}
```

In `fetchJazzNYC`, replace the `targetDates` block (lines ~208–213) with:

```js
  const targetDates = jazzTargetDates();
```

(`now` is no longer used there, so remove `const now = new Date();` if nothing else in the function reads it.)

In `src/fetchers/ticketmaster.js`, change the import to `fetchWindow` and line 80 to:

```js
  // Tonight and tomorrow evening, so the feed can offer both.
  const { utcStart: start, utcEnd: end } = fetchWindow();
```

In `src/fetchers/seatgeek.js`, do the same, keeping the existing comment:

```js
  // SeatGeek's datetime_local filters are naive NYC wall-clock, not UTC.
  const { localStart: start, localEnd: end } = fetchWindow();
```

Then remove `tonightWindow` from `tonight-window.js`, since nothing uses it any more. Move its useful tests onto `fetchWindow` by rewriting the old `tonightWindow` tests in `tonight-window.test.js` as below and deleting the originals. Keep the `nycLocalToUtc` test. Update the header comment of the "FOR THE FETCHERS" section to say it now covers tonight and tomorrow.

```js
test("fetchWindow is the same seen from UTC or NYC (host timezone does not matter)", () => {
  const w = fetchWindow(new Date("2026-09-02T01:00:00Z")); // 9pm EDT Sept 1
  assert.equal(w.localStart, "2026-09-01T17:00:00");
  assert.equal(w.utcStart, "2026-09-01T21:00:00Z");
});

test("fetchWindow at 5am has rolled over to the new evening", () => {
  assert.equal(fetchWindow(new Date("2026-09-02T09:00:00Z")).localStart, "2026-09-02T17:00:00");
});

test("fetchWindow in winter uses EST", () => {
  const w = fetchWindow(new Date("2026-01-15T22:30:00Z")); // 17:30 EST
  assert.equal(w.utcStart, "2026-01-15T22:00:00Z");
  assert.equal(w.utcEnd, "2026-01-17T09:00:00Z"); // 4am EST, two days on
});

test("fetchWindow across spring-forward ends at 4am EDT", () => {
  const w = fetchWindow(new Date("2026-03-06T23:00:00Z")); // 18:00 EST Mar 6
  assert.equal(w.utcStart, "2026-03-06T22:00:00Z");
  assert.equal(w.localEnd, "2026-03-08T04:00:00");
  assert.equal(w.utcEnd, "2026-03-08T08:00:00Z");
});
```

Remove `tonightWindow` from the test file's import.

- [ ] **Step 4: Run the full backend suite.**

Run: `npm test`
Expected: PASS. Then `grep -rn "tonightWindow" src` should print nothing.

- [ ] **Step 5: Commit.**

```bash
git add src/fetchers src/services/tonight-window.js src/services/tonight-window.test.js
git commit -m "feat(pipeline): fetch tomorrow evening as well as tonight"
```

---

### Task 3: Hooks for tomorrow's events

`runHookGeneration` and `runSurpriseScore` each hold an inline copy of the old tonight window. The spec assumed enrichment would cover the extra events unchanged. Hooks would not, so every Tomorrow card would arrive with no hook. Surprise scores stay tonight-only on purpose, because Surprise Me is hidden on Tomorrow.

**Files:**
- Modify: `src/services/hook-generation.js:15-55`
- Test: `src/services/hook-generation.test.js`

**Interfaces:**
- Consumes: `nightBounds`, `nightWindowSql` from Task 1.
- Produces: exported `buildPrompt(event)` and `HOOK_CANDIDATES_SQL` (with `$1` = start, `$2` = end).

- [ ] **Step 1: Write the failing tests.** Append to `src/services/hook-generation.test.js` and extend the import with `buildPrompt, HOOK_CANDIDATES_SQL`, plus `import { nightWindowSql } from "./tonight-window.js";`:

```js
test("the prompt forbids day words, because one hook is shown on two days", () => {
  // A hook generated for a tomorrow event is still on the card the next
  // evening, when that event is tonight.
  const prompt = buildPrompt({ name: "x", segment: "Music", genre: null, venue_name: "Smalls", neighborhood: null, is_free: false });
  assert.match(prompt, /Do not say "tonight" or "tomorrow"/);
});

test("hook candidates cover tonight and tomorrow, soonest first", () => {
  assert.ok(HOOK_CANDIDATES_SQL.includes(nightWindowSql("$1", "$2")));
  assert.match(HOOK_CANDIDATES_SQL, /ORDER BY e\.start_time/);
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**

Run: `node --test src/services/hook-generation.test.js`
Expected: FAIL, `buildPrompt` is not exported.

- [ ] **Step 3: Implement.** In `hook-generation.js`:
  - Change `function buildPrompt` to `export function buildPrompt`.
  - Replace the line `- Present tense, tonight's context` in the prompt with these two lines:
    ```
    - Present tense
    - Do not say "tonight" or "tomorrow"; the same line is shown on both days
    ```
  - Import `nightBounds, nightWindowSql` from `./tonight-window.js`, then add the following and use it in `runHookGeneration`:

```js
// Tonight first, then tomorrow. Ordered so that if more than LIMIT events lack
// a hook, the ones closest to being seen get theirs this run.
export const HOOK_CANDIDATES_SQL = `
  SELECT e.event_id, e.name, e.segment, e.genre, e.price_min, e.price_max, e.is_free,
         v.name AS venue_name, v.neighborhood
  FROM events e
  LEFT JOIN venues v ON e.venue_id = v.venue_id
  WHERE e.hook IS NULL
    AND ${nightWindowSql("$1", "$2")}
    AND e.availability_tier != 'cancelled'
  ORDER BY e.start_time
  LIMIT 100
`;
```

```js
export async function runHookGeneration() {
  const now = new Date();
  const { rows } = await pool.query(HOOK_CANDIDATES_SQL, [
    nightBounds("tonight", now).start,
    nightBounds("tomorrow", now).end,
  ]);
```

- [ ] **Step 4: Run the tests and confirm they pass.**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/services/hook-generation.js src/services/hook-generation.test.js
git commit -m "feat(pipeline): write hooks for tomorrow's events too"
```

---

### Task 4: `GET /events/tonight?night=` and alternatives from the right night

**Files:**
- Modify: `src/services/alternatives.js`, `src/server.js:8,111-260`, `src/services/tonight-window.js` (remove `TONIGHT_WINDOW_SQL`)
- Test: `src/services/alternatives.test.js`

**Interfaces:**
- Consumes: `nightBounds`, `nightOf`, `nightWindowSql`, `parseFeedNight` from Task 1.
- Produces: an API response with `night: "tonight"|"tomorrow"` on both response shapes. `fetchAlternatives(event, pool?, now?: Date)`. `ALTERNATIVES_SQL` gains `$8` (window start) and `$9` (window end).

- [ ] **Step 1: Write the failing tests.** In `src/services/alternatives.test.js`, replace the import of `TONIGHT_WINDOW_SQL` with `import { nightWindowSql } from "./tonight-window.js";`, replace the test `"ALTERNATIVES_SQL reuses the shared tonight window verbatim"` with the first test below, and add the other two:

```js
test("ALTERNATIVES_SQL takes its window as parameters $8/$9", () => {
  // If alternatives used a wider window it would offer events the feed itself
  // refuses to show — the user taps through to something that isn't there.
  assert.ok(ALTERNATIVES_SQL.includes(nightWindowSql("$8", "$9")));
});

test("a sold-out show tonight gets alternatives from tonight", async () => {
  const pool = fakePool();
  const now = new Date("2026-08-13T22:00:00Z"); // 6pm EDT
  await fetchAlternatives(soldOut, pool, now); // soldOut starts 7:30pm Aug 13
  const [, , , , , , , start, end] = pool.calls[0].params;
  assert.equal(start.toISOString(), "2026-08-13T21:30:00.000Z"); // now − 30 min
  assert.equal(end.toISOString(), "2026-08-14T08:00:00.000Z");
});

test("a sold-out show tomorrow gets alternatives from tomorrow", async () => {
  const pool = fakePool();
  const now = new Date("2026-08-13T22:00:00Z");
  await fetchAlternatives({ ...soldOut, start_time: "2026-08-14T23:30:00.000Z" }, pool, now);
  const [, , , , , , , start, end] = pool.calls[0].params;
  assert.equal(start.toISOString(), "2026-08-14T21:00:00.000Z"); // Aug 14 5pm EDT
  assert.equal(end.toISOString(), "2026-08-15T08:00:00.000Z");
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**

Run: `node --test src/services/alternatives.test.js`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Implement alternatives.** In `alternatives.js`:
  - Change the import to `import { nightBounds, nightOf, nightWindowSql } from "./tonight-window.js";`.
  - In `ALTERNATIVES_SQL`, replace `WHERE ${TONIGHT_WINDOW_SQL.trim()}` with `WHERE ${nightWindowSql("$8", "$9")}`.
  - Update the params comment to `// $1 event_id, $2 lat, $3 lng, $4 start_time, $5 radius_km, $6 limit, $7 neighborhood, $8/$9 window`.
  - Change `fetchAlternatives`:

```js
// Alternatives come from the sold-out event's own night: a show tomorrow
// should be swapped for something else tomorrow, not for something tonight.
export async function fetchAlternatives(event, pool = poolDefault, now = new Date()) {
  if (!offersAlternatives(event)) return [];
  try {
    const { start, end } = nightBounds(nightOf(event.start_time, now), now);
    const { rows } = await pool.query(ALTERNATIVES_SQL, [
      event.event_id,
      event.venue_lat,
      event.venue_lng,
      event.start_time,
      ALTERNATIVES_RADIUS_KM,
      MAX_ALTERNATIVES,
      event.neighborhood ?? null,
      start,
      end,
    ]);
    return rows;
```

  Run `node --test src/services/alternatives.test.js` and confirm it passes.

- [ ] **Step 4: Implement the route.** In `src/server.js`:
  - Change the import to `import { nightBounds, nightWindowSql, parseFeedNight } from "./services/tonight-window.js";`.
  - In the query-param doc comment above the route, add:
    ```
    //   night           — tonight (default) | tomorrow. Tomorrow skips travel
    //                     enrichment (a leave-by from where you stand now is
    //                     wrong for tomorrow) and rejects surprise_me.
    ```
  - Right after the `const includeAttractions = ...` line, add:

```js
  const parsedNight = parseFeedNight({ night: req.query.night, surpriseMe });
  if (parsedNight.error) return res.status(parsedNight.status).json({ error: parsedNight.error });
  const { night } = parsedNight;
  const { start: windowStart, end: windowEnd } = nightBounds(night);
```

  - Geo branch: replace `WHERE ${TONIGHT_WINDOW_SQL.trim()}` with `WHERE ${nightWindowSql("$6", "$7")}` and set `params = [lat, lng, radiusMiles, RANKING_POOL, segment, windowStart, windowEnd];`.
  - Non-geo branch: replace it with `WHERE ${nightWindowSql("$3", "$4")}` and set `params = [RANKING_POOL, segment, windowStart, windowEnd];`.
  - Travel enrichment: change `let filterable = hasGeo ? ... : rows;` to:

```js
    // Tomorrow gets no travel time: a leave-by worked out from where the user
    // stands now is wrong for tomorrow, and it would spend Google Maps calls.
    let filterable = hasGeo && night === "tonight"
      ? await Promise.all(/* unchanged */)
      : hasGeo
        ? rows.map((e) => ({ ...e, travel_minutes: null, leave_by: null, travel_source: null }))
        : rows;
```

  (Keep the existing `rows.map(async ...)` body exactly where `/* unchanged */` is.)
  - Add `night,` after `sort` in **both** `res.json({...})` calls.
  - Remove `TONIGHT_WINDOW_SQL` and its comment block from `tonight-window.js`. Then `grep -rn "TONIGHT_WINDOW_SQL" src` should print nothing. Move the useful part of its comment (why the lower bound is 30 minutes ago and why Railway's UTC matters) onto the `TONIGHT AND TOMORROW` block.

- [ ] **Step 5: Run the suite.**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Smoke-test locally against the production DB (read-only GETs).** Don't start the server within 10 minutes of 10am, 2pm, 5pm or 8pm ET: `startScheduler()` would run the pipeline against production from your laptop.

```bash
set -a; . ./.env.nowgo; set +a; PORT=3999 node src/server.js &
sleep 3   # if foreground sleep is blocked, poll /health instead
curl -s 'localhost:3999/events/tonight?limit=3' | jq '{night, count}'
curl -s 'localhost:3999/events/tonight?night=tomorrow&limit=500&lat=40.73&lng=-73.99' | jq '{night, count, first: .events[0].start_time, travel: [.events[].leave_by] | unique}'
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:3999/events/tonight?night=friday'
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:3999/events/tonight?night=tomorrow&surprise_me=true'
kill %1
```

Expected: `night: "tonight"`; the tomorrow call returns `night: "tomorrow"` and `travel: [null]`; the last two print `400`. The tomorrow count will be 0 until the pipeline has run with Task 2 deployed, which is expected.

- [ ] **Step 7: Commit.**

```bash
git add src/server.js src/services/alternatives.js src/services/alternatives.test.js src/services/tonight-window.js
git commit -m "feat(api): serve tomorrow night via /events/tonight?night=tomorrow"
```

---

### Task 5: App plumbing: `Night` type, API param, auto-switch rule, share text

**Files:**
- Modify: `mobile/src/types/index.ts`, `mobile/src/api/nowgo.ts`, `mobile/src/services/share.ts`, `mobile/package.json` (test script)
- Create: `mobile/src/services/night.ts`, `mobile/src/services/night.test.ts`
- Test: `mobile/src/services/share.test.ts`

**Interfaces:**
- Produces:
  - `export type Night = "tonight" | "tomorrow";` in `types/index.ts`
  - `FetchEventsParams.night?: Night`; `TonightFeedResponse.night?: Night`; `RootStackParamList["EventDetail"].night?: Night`
  - `shouldOpenOnTomorrow(now: Date, tonightCount: number): boolean`
  - `autoSwitchNotice(tonightCount: number): string`
  - `shareMessage(event, leaveBy?, now = new Date(), night: Night = "tonight"): string`

- [ ] **Step 1: Write the failing tests.** Create `mobile/src/services/night.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert";
import { shouldOpenOnTomorrow, autoSwitchNotice } from "./night.ts";

// EDT: ET = UTC−4.
const at = (utc: string) => new Date(utc);

test("opens on tomorrow late at night when fewer than 5 remain", () => {
  assert.equal(shouldOpenOnTomorrow(at("2026-09-02T02:00:00Z"), 4), true); // 10pm
  assert.equal(shouldOpenOnTomorrow(at("2026-09-02T05:00:00Z"), 0), true); // 1am
  assert.equal(shouldOpenOnTomorrow(at("2026-09-02T07:59:00Z"), 2), true); // 3:59am
});

test("does not switch when tonight still has 5 or more", () => {
  assert.equal(shouldOpenOnTomorrow(at("2026-09-02T03:00:00Z"), 5), false); // 11pm
});

test("does not switch before 10pm or from 4am, however empty tonight is", () => {
  assert.equal(shouldOpenOnTomorrow(at("2026-09-02T01:59:00Z"), 0), false); // 9:59pm
  assert.equal(shouldOpenOnTomorrow(at("2026-09-02T08:00:00Z"), 0), false); // 4:00am
  assert.equal(shouldOpenOnTomorrow(at("2026-09-01T18:00:00Z"), 0), false); // 2pm
});

test("uses NYC time, not the device's zone", () => {
  // 21:30Z is 5:30pm in NYC but 10:30pm in London. A phone set to London
  // time must not switch.
  assert.equal(shouldOpenOnTomorrow(at("2026-09-01T21:30:00Z"), 0), false);
});

test("the notice counts what is left tonight", () => {
  assert.equal(autoSwitchNotice(3), "Only 3 things left tonight. Showing tomorrow night.");
  assert.equal(autoSwitchNotice(1), "Only 1 thing left tonight. Showing tomorrow night.");
  assert.equal(autoSwitchNotice(0), "Nothing left tonight. Showing tomorrow night.");
});
```

Append to `mobile/src/services/share.test.ts`:

```ts
test("a tomorrow share says tomorrow night and never a leave-by", () => {
  const msg = shareMessage(base, IN_AN_HOUR, NOW, "tomorrow");
  assert.match(msg, /^Makoto Ozone Trio at Birdland Jazz Club, tomorrow night\. https:/);
  assert.ok(!/leave by/.test(msg));
  assert.ok(!/tonight/.test(msg));
});

test("a sold-out tomorrow share does not say tonight", () => {
  const msg = shareMessage({ ...base, availability_tier: "sold_out" }, null, NOW, "tomorrow");
  assert.match(msg, /sold out tomorrow night, sadly\./);
});
```

Add `src/services/night.test.ts` to the end of the `test` script in `mobile/package.json`.

- [ ] **Step 2: Run the tests and confirm they fail.**

Run: `cd mobile && npm test`
Expected: FAIL, `./night.ts` is not found and the new share tests fail.

- [ ] **Step 3: Implement.**

`mobile/src/types/index.ts`: add `export type Night = "tonight" | "tomorrow";` and:
- in `TonightFeedResponse`: `night?: Night;`
- in `FetchEventsParams`: `night?: Night;`
- in `RootStackParamList["EventDetail"]`: `night?: Night;`, with the comment `// Which night the feed was showing. Decides the tomorrow variant; absent means tonight.`

Create `mobile/src/services/night.ts`:

```ts
// Whether the feed should open on tomorrow night, and what it says when it
// does. Pure and dependency-free, like the other services here, so it runs
// under `node --test`.
//
// Someone who opens the app late (say from a link at 11pm) would otherwise
// land on an almost empty feed, because tonight drops anything that started
// more than 30 minutes ago.

const LATE_FROM_HOUR = 22; // 10pm ET
const EVENING_ENDS_HOUR = 4; // 4am ET, when tonight's window ends
const FEW_EVENTS = 5;

// Always NYC time: the feed is NYC's, whatever zone the phone is set to.
function nycHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return Number(h) % 24; // some engines render midnight as "24"
}

export function shouldOpenOnTomorrow(now: Date, tonightCount: number): boolean {
  const h = nycHour(now);
  const late = h >= LATE_FROM_HOUR || h < EVENING_ENDS_HOUR;
  return late && tonightCount < FEW_EVENTS;
}

export function autoSwitchNotice(tonightCount: number): string {
  const lead =
    tonightCount === 0
      ? "Nothing left tonight."
      : `Only ${tonightCount} ${tonightCount === 1 ? "thing" : "things"} left tonight.`;
  return `${lead} Showing tomorrow night.`;
}
```

`mobile/src/services/share.ts`: add `Night` to the type import and change `shareMessage`:

```ts
export function shareMessage(
  event: Pick<Event, "name" | "venue_name" | "url" | "availability_tier">,
  leaveBy?: string | null,
  now: Date = new Date(),
  night: Night = "tonight"
): string {
  const venue = event.venue_name ?? "a venue in NYC";
  const when = night === "tomorrow" ? "tomorrow night" : "tonight";

  // (keep the existing sold-out comment)
  if (event.availability_tier === "sold_out") {
    return `${event.name} at ${venue} — sold out ${when}, sadly.${CREDIT}`;
  }

  // A leave-by is only ever about tonight. For tomorrow it would be advice
  // computed from where the user stands right now, so it is never sent.
  const opening = night === "tonight" && isStillUseful(leaveBy, now)
    ? `${event.name} at ${venue} — leave by ${formatTime(leaveBy!)} to make it.`
    : `${event.name} at ${venue}, ${when}.`;

  return (event.url ? `${opening} ${event.url}` : opening) + CREDIT;
}
```

`mobile/src/api/nowgo.ts`: add `night = "tonight",` to the destructured params, and after the `sort` line add:

```ts
  params.set("night", night);
```

- [ ] **Step 4: Run the tests and confirm they pass.**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/types/index.ts mobile/src/api/nowgo.ts mobile/src/services/night.ts mobile/src/services/night.test.ts mobile/src/services/share.ts mobile/src/services/share.test.ts mobile/package.json
git commit -m "feat(mobile): night type, auto-switch rule and tomorrow share text"
```

---

### Task 6: Tomorrow variant of the card and the event screen

**Files:**
- Modify: `mobile/src/components/eventCardHelpers.ts`, `mobile/src/components/EventCard.tsx`, `mobile/src/screens/EventDetail.tsx`
- Test: `mobile/src/components/eventCardHelpers.test.ts`

**Interfaces:**
- Consumes: `Night` (Task 5), `shareMessage(..., night)` (Task 5).
- Produces: `tomorrowLabel(startTime: string, showtimes?: string[] | null): string`. `EventCard` gets the prop `night?: Night` (default `"tonight"`). `EventDetail` reads `route.params.night`.

- [ ] **Step 1: Write the failing test.** Append to `eventCardHelpers.test.ts` and add `tomorrowLabel` to its import:

```ts
test("tomorrowLabel names the day and the start time in NYC", () => {
  assert.equal(tomorrowLabel("2026-09-03T00:00:00Z"), "Tomorrow 8:00 PM"); // 8pm EDT
});

test("tomorrowLabel shows a timed-entry span", () => {
  assert.equal(
    tomorrowLabel("2026-09-02T14:00:00Z", ["2026-09-02T14:00:00Z", "2026-09-02T16:00:00Z"]),
    "Tomorrow 10:00 AM–12:00 PM" // 10am–noon EDT; meridiems differ so both are kept
  );
});
```

- [ ] **Step 2: Run the test and confirm it fails.**

Run: `cd mobile && npm test`
Expected: FAIL, `tomorrowLabel` is not exported.

- [ ] **Step 3: Implement the helper.** In `eventCardHelpers.ts`, after `formatTimeSpan`:

```ts
// What a tomorrow card shows where tonight's shows the leave-by. There is no
// leave-by and no "starts in" for tomorrow: both would be computed from now.
export function tomorrowLabel(startTime: string, showtimes?: string[] | null): string {
  return `Tomorrow ${formatTimeSpan(startTime, showtimes)}`;
}
```

- [ ] **Step 4: Card.** In `EventCard.tsx`:
  - Import `type Night` from `../types` and `tomorrowLabel` from `./eventCardHelpers`.
  - Add a prop to `EventCardProps`: `// Which night the feed is showing. Tomorrow has no leave-by and no countdown.` and `night?: Night;`. Destructure it as `night = "tonight"`.
  - Replace the `lb` and `ctx` lines with:

```tsx
  const isTomorrow = night === "tomorrow";
  const lb = isTomorrow
    ? { text: "", color: "#22C55E", bold: false }
    : leaveByResult(event.leave_by, event.availability_tier, now);
  const ctx = isTomorrow
    ? { text: tomorrowLabel(event.start_time, event.showtimes), color: "#60a5fa" }
    : contextualLabelResult(event.start_time, event.travel_minutes, now, hasOrigin);
```

- [ ] **Step 5: Event screen.** In `EventDetail.tsx`:
  - Destructure `night = "tonight"` from `route.params` and add `const isTomorrow = night === "tomorrow";`.
  - `switchMode`: change its first line to `if (isTomorrow || newMode === mode || !hasGeo) return;`.
  - The leave-by card: change `{(lb || hasGeo) ? (` to `{!isTomorrow && (lb || hasGeo) ? (`.
  - Share: `shareMessage(event, leaveBy, new Date(), night)`.
  - Calendar: `calendarEntryFor(event, isTomorrow ? null : leaveBy)` and `entryAlarmLabel(isTomorrow ? null : leaveBy)`.
  - Alternatives `navigation.push`: add `night,` so a tomorrow alternative opens as a tomorrow event.
  - Calendar as the primary action on tomorrow. Pull the existing Add to Calendar `TouchableOpacity` out into a const above `return`, styled primary on tomorrow:

```tsx
  // Tomorrow, the useful thing to do with an event is remember it, so Add to
  // Calendar leads and the ticket link steps down to a secondary button.
  const calendarButton = (
    <TouchableOpacity
      style={isTomorrow ? styles.ticketsBtn : styles.shareBtn}
      onPress={async () => { /* existing body, with calendarEntryFor(event, isTomorrow ? null : leaveBy) */ }}
    >
      <Text style={isTomorrow ? styles.ticketsBtnText : styles.shareBtnText}>
        {entryAlarmLabel(isTomorrow ? null : leaveBy)}
      </Text>
    </TouchableOpacity>
  );
```

  In the CTA row, render `{isTomorrow ? calendarButton : null}` as the first child, and `{isTomorrow ? null : calendarButton}` where the calendar button used to be (last). On the Get Tickets button, use `style={isTomorrow ? styles.directionsBtn : styles.ticketsBtn}` and `style={isTomorrow ? styles.directionsBtnText : styles.ticketsBtnText}` on its text.

- [ ] **Step 6: Run the tests and typecheck.**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit.**

```bash
git add mobile/src/components mobile/src/screens/EventDetail.tsx
git commit -m "feat(mobile): tomorrow variant of the event card and event screen"
```

---

### Task 7: The Tonight / Tomorrow switch in the feed

**Files:**
- Modify: `mobile/src/services/analytics.ts`, `mobile/src/screens/TonightFeed.tsx`

**Interfaces:**
- Consumes: `Night`, `shouldOpenOnTomorrow`, `autoSwitchNotice`, `fetchTonightEvents({ night })` (Task 5); `EventCard night` and `EventDetail` route `night` (Task 6).
- Produces: `analytics.feedLoaded(count, segment, night)`, `analytics.nightSwitched(to: Night, auto: boolean)`.

No unit test here: the decision logic is already tested in `night.test.ts`, and this task is wiring. Check it with the typecheck and screenshots (Task 8).

- [ ] **Step 1: Analytics.** In `analytics.ts`, import `type { Night } from "../types"` and:

```ts
    feedLoaded: (count: number, segment: string, night: Night) =>
      posthog?.capture("feed_loaded", { event_count: count, segment, night }),

    // `auto` separates the late-night auto-switch from a deliberate tap, so
    // the notice's "back to tonight" rate says whether the switch was wanted.
    nightSwitched: (to: Night, auto: boolean) =>
      posthog?.capture("night_switched", { to, auto }),
```

- [ ] **Step 2: Feed state and loading.** In `TonightFeed.tsx`:
  - Imports: add `useRef` to the React import, `type Night` to the types import, and `import { shouldOpenOnTomorrow, autoSwitchNotice } from "../services/night";`.
  - State, after `walkInsOnly`:

```tsx
  const [night, setNight] = useState<Night>("tonight");
  // Set when the feed switched itself to tomorrow; the notice explains why
  // and is the one-tap way back. Cleared by any deliberate switch.
  const [autoNotice, setAutoNotice] = useState<string | null>(null);
  // The auto-switch is decided once, on the first tonight load that succeeds.
  // After that a tap on Tonight must stay on Tonight.
  const autoDecided = useRef(false);

  function selectNight(next: Night) {
    if (next === night) return;
    setAutoNotice(null);
    setNight(next);
    analytics.nightSwitched(next, false);
  }
```

  - In `load`: pass `night` to the main `fetchTonightEvents({...})` call **and** to the coverage probe (`fetchTonightEvents({ mode, sortBy, night })`). Without the second one, an out-of-town user who was auto-switched to Tomorrow gets "No events" instead of the NYC-only message. Replace `analytics.feedLoaded(loaded.length, category);` with:

```tsx
      if (!autoDecided.current && night === "tonight") {
        autoDecided.current = true;
        if (shouldOpenOnTomorrow(new Date(), loaded.length)) {
          setAutoNotice(autoSwitchNotice(loaded.length));
          setNight("tomorrow"); // re-runs load via its dependency on night
          analytics.nightSwitched("tomorrow", true);
          return;
        }
      }
      analytics.feedLoaded(loaded.length, category, night);
```

  - Add `night` to `load`'s `useCallback` dependency array.

- [ ] **Step 3: The switch, the notice, and Surprise Me.** Above `{/* Row 1 — Category pills */}`:

```tsx
      {/* Tonight / Tomorrow. Every filter below applies to whichever is chosen. */}
      <View style={styles.nightSwitch}>
        {(["tonight", "tomorrow"] as const).map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.nightOption, night === n && styles.nightOptionActive]}
            onPress={() => selectNight(n)}
            accessibilityRole="button"
            accessibilityState={{ selected: night === n }}
          >
            <Text style={[styles.nightOptionText, night === n && styles.nightOptionTextActive]}>
              {n === "tonight" ? "Tonight" : "Tomorrow"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {autoNotice ? (
        <TouchableOpacity style={styles.autoNotice} onPress={() => selectNight("tonight")} activeOpacity={0.7}>
          <Text style={styles.autoNoticeText}>
            {autoNotice} <Text style={styles.autoNoticeLink}>Back to tonight</Text>
          </Text>
        </TouchableOpacity>
      ) : null}
```

  Wrap the Surprise Me `TouchableOpacity` in `{night === "tonight" ? ( ... ) : null}`, with the comment `{/* Surprise Me means "the next 30–90 minutes", so it has no tomorrow. */}`.

  Styles, in the same palette as the chips:

```tsx
  nightSwitch: {
    flexDirection: "row", marginHorizontal: 16, marginTop: 12, padding: 3,
    backgroundColor: "#1A1A1A", borderRadius: 10, borderWidth: 1, borderColor: "#2A2A2A",
  },
  nightOption: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  nightOptionActive: { backgroundColor: "#FF6B35" },
  nightOptionText: { color: "#9CA3AF", fontSize: 14, fontWeight: "600" },
  nightOptionTextActive: { color: "#FFFFFF", fontWeight: "700" },
  autoNotice: { marginHorizontal: 16, marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#161616", borderRadius: 8 },
  autoNoticeText: { color: "#9CA3AF", fontSize: 13 },
  autoNoticeLink: { color: "#FF6B35", fontWeight: "600" },
```

- [ ] **Step 4: Pass the night down and fix the copy.**
  - Every `<EventCard ... />` (feed list and sold-out list): add `night={night}`.
  - Every `navigation.navigate("EventDetail", {...})` in this file (feed list and sold-out list, but not Surprise Me, which is always tonight): add `night,`.
  - Empty-state text: `{reason === "filtered" ? "No events match your filters" : night === "tomorrow" ? "Nothing listed for tomorrow night yet" : "No events tonight"}`.
  - Count label: after `{events.length} events`, add `{night === "tomorrow" ? " tomorrow" : ""}`.

- [ ] **Step 5: Typecheck and run the tests.**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit.**

```bash
git add mobile/src/services/analytics.ts mobile/src/screens/TonightFeed.tsx
git commit -m "feat(mobile): Tonight / Tomorrow switch, opening on tomorrow late at night"
```

---

### Task 8: Ship the backend, then check the app

- [ ] **Step 1: Full checks.** Root `npm test`; `cd mobile && npm test && npx tsc --noEmit && npx expo-doctor@latest`.
- [ ] **Step 2: Ask Donnie before merging to `main`.** Pushing `main` deploys to Railway. No migration is needed. After the deploy, trigger `POST /pipeline/run` (see CLAUDE.md) so tomorrow's events exist, then check `railway logs` for the Ticketmaster window line (it should end two days out) and for `Ingested N events, skipped M` with a normal `M`.
- [ ] **Step 3: Live API check.** `curl -s 'https://nowgo-production.up.railway.app/events/tonight?night=tomorrow&limit=500' | jq '[.events[].source] | group_by(.) | map({(.[0]): length}) | add'` should show all three sources (`ticketmaster`, `seatgeek`, `jazz_nyc`). Run it again around 11pm ET, as the spec requires before build 12.
- [ ] **Step 4: App check in the simulator.** `cd mobile && npx expo start`, then take screenshots of: the switch on Tonight; Tomorrow with "Tomorrow 8:00 PM" cards and no Surprise Me; a tomorrow event screen (no leave-by card, Add to Calendar first). Test the auto-switch by temporarily calling `shouldOpenOnTomorrow(new Date("2026-09-02T03:00:00Z"), loaded.length)` and revert it before committing. Per CLAUDE.md, simulator tap automation is unreliable, so report screenshots as screenshots, not as interactive proof.
- [ ] **Step 5: Build 12 is held as the recruiting release.** Building and submitting it is a separate decision for Donnie, and not part of this plan.

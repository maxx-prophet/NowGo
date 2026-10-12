// The definition of "tonight", in one place.
//
// Was inlined separately in both /events/tonight query branches; alternatives.js
// needs the identical window, and a third copy is how these drift. An
// alternative computed against a wider window would offer an event the feed
// itself refuses to show.
//
// Assumes the events table is aliased as `e`.
//
// Lower bound: 30 minutes ago, not now — a show that just started is still
// worth walking into. This is also why the feed looks empty late at night;
// that is correct behavior, not a bug.
//
// Upper bound: 4am the following NYC morning. Computed in America/New_York
// explicitly because Railway runs UTC, where "today" is already tomorrow after
// 8pm ET.
export const TONIGHT_WINDOW_SQL = `
  e.start_time > NOW() - interval '30 minutes'
  AND e.start_time < (date_trunc('day', NOW() AT TIME ZONE 'America/New_York') + interval '1 day 4 hours') AT TIME ZONE 'America/New_York'
`;

// ─── FETCH WINDOW FOR BOTH EVENINGS ──────────────────────────────────────────
//
// The fetchers must go and *get* the same window the API will serve, and they
// had drifted apart.
//
// Both ticketing fetchers used to build the window with `new Date()` +
// `setHours(17)`, which resolves against the host's local zone. Railway runs
// UTC, so in production Ticketmaster was being asked for:
//
//   17:00Z → 02:00Z  =  1pm → 10pm ET
//
// The whole 10pm–4am stretch was never fetched even though TONIGHT_WINDOW_SQL
// happily serves it, and a third of the request was spent on afternoon events.
// SeatGeek's `datetime_local` params are naive local times, so the identical
// helper was wrong in the opposite direction there — right on Railway by
// accident, four hours late on a developer's Mac.
//
// The two APIs want different representations of the same instant:
//   - Ticketmaster `startDateTime`/`endDateTime` — UTC, trailing Z
//   - SeatGeek     `datetime_local.gte`/`.lte`   — naive NYC wall clock
//
// fetchWindow spans the current evening's 5pm through tomorrow's 4am, so both
// evenings can be served in a single request. It returns both API formats from
// one source of truth.

const NYC = "America/New_York";

const WINDOW_START_HOUR = 17; // 5pm ET
const WINDOW_END_HOUR = 4; // 4am ET, matching TONIGHT_WINDOW_SQL's upper bound

function partsInZone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(
    fmt.formatToParts(date).map(({ type, value }) => [type, value])
  );
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    // Intl can render midnight as "24" under hour12:false.
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

// How far the zone sits from UTC, in ms, at this instant.
function zoneOffsetMs(date, timeZone) {
  const p = partsInZone(date, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// The UTC instant at which the NYC wall clock reads the given local time.
// Applied twice so a window edge that straddles a DST change still lands right.
export function nycLocalToUtc(year, month, day, hour, minute = 0) {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = naive;
  for (let i = 0; i < 2; i += 1) {
    utc = naive - zoneOffsetMs(new Date(utc), NYC);
  }
  return new Date(utc);
}

const pad = (n) => String(n).padStart(2, "0");
const localStr = (y, m, d, h) => `${y}-${pad(m)}-${pad(d)}T${pad(h)}:00:00`;
const utcStr = (date) => `${date.toISOString().split(".")[0]}Z`;

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

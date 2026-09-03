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

// ─── THE SAME WINDOW, FOR THE FETCHERS ───────────────────────────────────────
//
// The SQL above is what the API will *serve*. This is what the fetchers must
// go and *get*, and the two had drifted apart.
//
// Both ticketing fetchers built their window with `new Date()` + `setHours(17)`,
// which resolves against the host's local zone. Railway runs UTC, so in
// production Ticketmaster was being asked for:
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
// so this returns both, from one source of truth, and ends at 4am to match.

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

export function tonightWindow(now = new Date()) {
  const nyc = partsInZone(now, NYC);

  // Before 4am ET we are still inside the previous evening's window, so anchor
  // to yesterday rather than jumping 16 hours forward to tonight.
  let { year, month, day } = nyc;
  if (nyc.hour < WINDOW_END_HOUR) {
    const prev = new Date(Date.UTC(year, month - 1, day));
    prev.setUTCDate(prev.getUTCDate() - 1);
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth() + 1;
    day = prev.getUTCDate();
  }

  const endDate = new Date(Date.UTC(year, month - 1, day));
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const endY = endDate.getUTCFullYear();
  const endM = endDate.getUTCMonth() + 1;
  const endD = endDate.getUTCDate();

  return {
    localStart: localStr(year, month, day, WINDOW_START_HOUR),
    localEnd: localStr(endY, endM, endD, WINDOW_END_HOUR),
    utcStart: utcStr(nycLocalToUtc(year, month, day, WINDOW_START_HOUR)),
    utcEnd: utcStr(nycLocalToUtc(endY, endM, endD, WINDOW_END_HOUR)),
  };
}

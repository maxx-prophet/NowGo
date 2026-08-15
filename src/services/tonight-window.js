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

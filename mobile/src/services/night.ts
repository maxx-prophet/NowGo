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

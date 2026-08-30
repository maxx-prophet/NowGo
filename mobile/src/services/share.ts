import type { Event } from "../types";

// The message a share produces. Pure and self-contained, like the other
// services here, so it runs under `node --test` without a bundler.
//
// The leave-by time is the part worth sending. Everything else in the line can
// be found with a search; "leave by 7:12pm to make it" is the thing only this
// app knows, and it is the reason to share at all.

// Deliberately duplicated from components/eventCardHelpers.formatTime rather
// than imported — every tested service in this folder is dependency-free, and
// a bundler-only import would make this untestable. The options must stay
// identical to that one; shareTimeFormatMatchesTheApp in share.test.ts fails
// if they drift.
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
}

// A leave-by that has already passed must never be shared as advice. The clock
// keeps running while the screen is open, so this is checked at share time
// rather than at load.
function isStillUseful(leaveBy: string | null | undefined, now: Date): boolean {
  if (!leaveBy) return false;
  return new Date(leaveBy).getTime() - now.getTime() > 0;
}

export function shareMessage(
  event: Pick<Event, "name" | "venue_name" | "url" | "availability_tier">,
  leaveBy?: string | null,
  now: Date = new Date()
): string {
  const venue = event.venue_name ?? "a venue in NYC";

  // A sold-out show gets no leave-by and no link. Sending someone to a ticket
  // page for a show with no tickets is the dead end the sold-out work exists
  // to remove, and it is worse in a text message than in the app — the
  // recipient has none of the context that would explain why it is a dead end.
  if (event.availability_tier === "sold_out") {
    return `${event.name} at ${venue} — sold out tonight, sadly.`;
  }

  const opening = isStillUseful(leaveBy, now)
    ? `${event.name} at ${venue} — leave by ${formatTime(leaveBy!)} to make it.`
    : `${event.name} at ${venue}, tonight.`;

  return event.url ? `${opening} ${event.url}` : opening;
}

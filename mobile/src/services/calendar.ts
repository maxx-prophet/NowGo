import type { Event } from "../types";

// The calendar entry "Add to Calendar" hands to the system event editor.
// Pure and dependency-free, like share.ts, so it runs under `node --test`;
// the expo-calendar call itself lives in the screen.
//
// The alarm is the point. A calendar can remind you when a show starts; only
// this app knows when you have to leave to make it. But leave_by was computed
// from where the user was standing at feed time, so the notes say so, and a
// leave-by that has already passed is never turned into a reminder.

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const FALLBACK_OFFSET_MIN = -30;

export type AlarmKind = "leave_by" | "before_start";

export interface CalendarEntry {
  title: string;
  startDate: Date;
  endDate: Date;
  location: string | null;
  url?: string;
  notes: string;
  alarms: Array<{ absoluteDate: string } | { relativeOffset: number }>;
  alarmKind: AlarmKind;
}

// Duplicated from components/eventCardHelpers.formatTime, for the same reason
// share.ts duplicates it: this folder's services import nothing that needs a
// bundler. Keep the options identical.
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
}

function isStillAhead(leaveBy: string | null | undefined, now: Date): leaveBy is string {
  return !!leaveBy && new Date(leaveBy).getTime() > now.getTime();
}

export function calendarEntryFor(
  event: Pick<Event, "name" | "venue_name" | "venue_address" | "url" | "start_time" | "end_time">,
  leaveBy: string | null | undefined,
  now: Date = new Date()
): CalendarEntry {
  const startDate = new Date(event.start_time);
  const endDate = event.end_time ? new Date(event.end_time) : new Date(startDate.getTime() + DEFAULT_DURATION_MS);
  const location = [event.venue_name, event.venue_address].filter(Boolean).join(", ") || null;

  const useLeaveBy = isStillAhead(leaveBy, now);
  const alarmKind: AlarmKind = useLeaveBy ? "leave_by" : "before_start";
  const alarms = useLeaveBy ? [{ absoluteDate: leaveBy }] : [{ relativeOffset: FALLBACK_OFFSET_MIN }];

  const notes = useLeaveBy
    ? `Leave by ${formatTime(leaveBy)} to make it — worked out from where you were when you saved this. Added by NowGo.`
    : "Added by NowGo.";

  return {
    title: event.name,
    startDate,
    endDate,
    location,
    ...(event.url ? { url: event.url } : {}),
    notes,
    alarms,
    alarmKind,
  };
}

import type { Event } from "../types";

// The email a "Send feedback" tap opens. Pure and self-contained, like the
// other services here, so it runs under `node --test` without a bundler.
//
// A report is only useful if it can be traced: "the price was wrong" with no
// build and no event id means a round trip of questions to someone who was
// doing us a favour. So the details are filled in for them — below the space
// they write in, because people write above whatever is pre-filled.

export const FEEDBACK_ADDRESS = "hello@nowgoapp.com";

export interface FeedbackContext {
  appVersion: string | null;
  build: string | null;
  device: string | null;
  osVersion: string | null;
}

// Same options as the event card's time, so the report quotes what the tester saw.
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
}

export function feedbackUrl(
  ctx: FeedbackContext,
  event?: Pick<Event, "event_id" | "name" | "venue_name" | "start_time">
): string {
  const lines: string[] = [];
  if (event) {
    lines.push(`Event: ${event.name}`);
    lines.push(`Venue: ${event.venue_name ?? "unknown"}`);
    lines.push(`Starts: ${formatTime(event.start_time)}`);
    lines.push(`ID: ${event.event_id}`);
  }
  const build = [ctx.appVersion, ctx.build ? `(${ctx.build})` : null].filter(Boolean).join(" ");
  if (build) lines.push(`Build ${build}`);
  const device = [ctx.device, ctx.osVersion ? `iOS ${ctx.osVersion}` : null].filter(Boolean).join(", ");
  if (device) lines.push(device);

  const subject = event ? `Problem with: ${event.name}` : "NowGo feedback";
  const body = `\n\n———\n${lines.join("\n")}`;

  return `mailto:${FEEDBACK_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

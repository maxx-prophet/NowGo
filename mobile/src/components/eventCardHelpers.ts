export interface LeaveByResult {
  text: string;
  color: string;
  bold: boolean;
}

export interface ContextualResult {
  text: string;
  color: string;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
}

export function formatPrice(
  min: number | null | undefined,
  max: number | null | undefined,
  isFree: boolean
): string {
  if (isFree) return "FREE";
  if (!min && !max) return "—";
  if (!max || min === max) return `$${Math.round(min!)}`;
  return `$${Math.round(min!)}–$${Math.round(max)}`;
}

export function leaveByResult(
  leaveBy: string | null | undefined,
  availabilityTier: string,
  now: Date = new Date()
): LeaveByResult {
  if (availabilityTier === "sold_out") {
    return { text: "No travel needed", color: "#6B7280", bold: false };
  }
  if (!leaveBy) {
    return { text: "", color: "#22C55E", bold: false };
  }
  const diffMin = (new Date(leaveBy).getTime() - now.getTime()) / 60_000;

  if (diffMin < -5) return { text: "Underway", color: "#6B7280", bold: false };
  if (diffMin <= 0) return { text: "⚡ Leave NOW", color: "#EF4444", bold: true };
  if (diffMin < 30) return { text: `Leave in ${Math.ceil(diffMin)}m`, color: "#22C55E", bold: false };
  return { text: `Leave by ${formatTime(leaveBy)}`, color: "#22C55E", bold: false };
}

export function contextualLabelResult(
  startTime: string,
  travelMinutes: number | null | undefined,
  now: Date = new Date()
): ContextualResult {
  if (travelMinutes == null) {
    return { text: "Time unknown", color: "#60a5fa" };
  }
  const startDate = new Date(startTime);
  const minutesSinceStart = (now.getTime() - startDate.getTime()) / 60_000;
  const minutesUntilStart = -minutesSinceStart;

  if (minutesSinceStart > 120) {
    return { text: "Underway", color: "#6B7280" };
  }
  if (minutesSinceStart > 0) {
    return {
      text: `Started ${Math.floor(minutesSinceStart)} min ago — still worth going`,
      color: "#60a5fa",
    };
  }
  if (minutesUntilStart < 60) {
    return { text: `Starts in ${Math.ceil(minutesUntilStart)} min`, color: "#60a5fa" };
  }
  const h = Math.floor(minutesUntilStart / 60);
  const m = Math.ceil(minutesUntilStart % 60);
  return { text: `Starts in ${h}h ${m}m`, color: "#60a5fa" };
}

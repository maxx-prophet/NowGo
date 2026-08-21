// Turning a curated venue policy into something we are willing to promise.
//
// The policies are a reliability scale, not a boolean: Smalls sells advance
// tickets AND admits walk-ins if there is room. Collapsing that to "walk-in"
// and telling someone no ticket is needed is a promise the venue has not made.
//
// 'unknown' returns null and renders nothing. It means nobody has curated the
// venue yet — not that walk-ins are refused. Saying either thing would be
// inventing a fact.

export type WalkInPolicy =
  | "always"
  | "space_permitting"
  | "standby"
  | "none"
  | "unknown";

export interface WalkInNotice {
  title: string;
  detail: string | null;
  tone: "good" | "mixed" | "plain";
}

export function walkInNotice(
  policy: string | null | undefined,
  doorPrice: string | number | null | undefined
): WalkInNotice | null {
  // The door price is what a walk-in pays, and it differs from the advance
  // price. It is deliberately left null whenever the cover varies by night, so
  // a number here is safe to show and its absence is never a reason to guess.
  const price = doorPrice == null ? null : Number(doorPrice);
  const atDoor =
    price != null && Number.isFinite(price)
      ? price === 0
        ? "Free at the door"
        : `$${price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)} at the door`
      : null;

  switch (policy) {
    case "always":
      return {
        title: "Walk-ins welcome",
        detail: atDoor ?? "No ticket needed — just turn up",
        tone: "good",
      };

    // Advance tickets exist and walk-ins get in only if there is room. "No
    // ticket needed" would be false here, which is what the old copy said.
    case "space_permitting":
      return {
        title: "Walk-ins if there's room",
        detail: atDoor
          ? `${atDoor} · selling tickets ahead is safer`
          : "Tickets are sold ahead — turning up works when it isn't full",
        tone: "mixed",
      };

    case "standby":
      return {
        title: "Standby list at the door",
        detail: "You can queue, but entry isn't guaranteed",
        tone: "mixed",
      };

    case "none":
      return {
        title: "Ticket needed in advance",
        detail: "This venue doesn't admit walk-ins",
        tone: "plain",
      };

    // Includes 'unknown', null, and any value a future migration adds before
    // this file learns about it. Silence is the honest default.
    default:
      return null;
  }
}

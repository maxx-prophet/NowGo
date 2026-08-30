import { usePostHog } from "posthog-react-native";

// Typed event capture hook — use this instead of calling posthog directly
export function useAnalytics() {
  const posthog = usePostHog();

  return {
    feedLoaded: (count: number, segment: string) =>
      posthog?.capture("feed_loaded", { event_count: count, segment }),

    eventTapped: (eventId: string, eventName: string, segment: string | null | undefined) =>
      posthog?.capture("event_tapped", { event_id: eventId, event_name: eventName, segment: segment ?? null }),

    categorySelected: (category: string) =>
      posthog?.capture("category_selected", { category }),

    // How many installs land outside NYC. A tester who opens the app in another
    // city sees an empty feed, and without this that reads in the funnel as
    // disinterest rather than as the app having no inventory where they are.
    outsideCoverageShown: (nationwideCount: number) =>
      posthog?.capture("outside_coverage_shown", { nationwide_count: nationwideCount }),

    browsedNycAnyway: () =>
      posthog?.capture("browsed_nyc_anyway"),

    // A share is the strongest signal the app produced something worth
    // telling someone about — and during friends-and-family it is the
    // mechanism by which one tester recruits the next. Carries the tier so a
    // share of a sold-out show (which sends no link) is distinguishable.
    eventShared: (eventId: string, availabilityTier: string) =>
      posthog?.capture("event_shared", { event_id: eventId, availability_tier: availabilityTier }),

    // Taps on a listing source's credit line. We promised jazz-nyc.com the
    // click it never gets today, so this is the number we can actually report
    // back to them rather than asserting the credit is "visible".
    sourceCreditTapped: (source: string, eventId: string) =>
      posthog?.capture("source_credit_tapped", { source, event_id: eventId }),

    surpriseMeTapped: () =>
      posthog?.capture("surprise_me_tapped"),

    // Launch-ready metric #5 is the Surprise Me skip rate, a proxy for
    // recommendation quality. `surprise_me_tapped` alone cannot express it —
    // it counts openings, not verdicts. These three record what the user
    // actually decided, so the rate is skipped / (skipped + accepted).
    //
    // `pick_index` matters: rejecting the first pick and taking the third
    // means the ranking is wrong, not that the inventory is bad.
    surpriseMeAccepted: (eventId: string, pickIndex: number) =>
      posthog?.capture("surprise_me_accepted", { event_id: eventId, pick_index: pickIndex }),

    surpriseMeSkipped: (pickIndex: number) =>
      posthog?.capture("surprise_me_skipped", { pick_index: pickIndex }),

    // Closed without taking anything — a softer rejection than an explicit
    // skip, and the one that says the whole set missed.
    surpriseMeDismissed: (pickIndex: number, offered: number) =>
      posthog?.capture("surprise_me_dismissed", { pick_index: pickIndex, offered }),

    directionsTapped: (eventId: string, mode: string) =>
      posthog?.capture("directions_tapped", { event_id: eventId, mode }),

    ticketsTapped: (eventId: string, eventName: string) =>
      posthog?.capture("tickets_tapped", { event_id: eventId, event_name: eventName }),

    budgetFilterApplied: (budgetMax: number | null) =>
      posthog?.capture("budget_filter_applied", { budget_max: budgetMax }),

    filterSheetOpened: () =>
      posthog?.capture("filter_sheet_opened"),

    sortChanged: (sortBy: string) =>
      posthog?.capture("sort_changed", { sort_by: sortBy }),

    walkInsFilterToggled: (enabled: boolean) =>
      posthog?.capture("walk_ins_filter_toggled", { enabled }),

    travelModeChanged: (eventId: string, mode: string) =>
      posthog?.capture("travel_mode_changed", { event_id: eventId, mode }),

    // Feeds launch-ready metric #3, the "already sold out" incident rate.
    // soldOutShown fires on every feed load that had any, so the denominator
    // is every feed view rather than only the ones a user chose to expand.
    soldOutShown: (soldOutCount: number, availableCount: number) =>
      posthog?.capture("sold_out_shown", {
        sold_out_count: soldOutCount,
        available_count: availableCount,
      }),

    soldOutRevealed: (soldOutCount: number) =>
      posthog?.capture("sold_out_revealed", { sold_out_count: soldOutCount }),

    alternativeTapped: (fromEventId: string, toEventId: string) =>
      posthog?.capture("alternative_tapped", { from_event_id: fromEventId, to_event_id: toEventId }),

    captureError: (error: Error, context?: Record<string, string | number | boolean | null>) =>
      posthog?.captureException(error, context),
  };
}

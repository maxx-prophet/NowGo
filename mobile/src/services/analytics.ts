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

    surpriseMeTapped: () =>
      posthog?.capture("surprise_me_tapped"),

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

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
  };
}

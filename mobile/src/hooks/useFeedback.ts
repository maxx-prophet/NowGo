import { Alert, Linking } from "react-native";
import * as Application from "expo-application";
import * as Device from "expo-device";
import type { Event } from "../types";
import { feedbackUrl, FEEDBACK_ADDRESS } from "../services/feedback";
import { useAnalytics } from "../services/analytics";

// Opens a pre-filled email. Someone with no Mail account set up gets the
// address instead of a silent no-op — a button that does nothing reads as a
// broken app, which is the opposite of what a feedback button is for.
export function useFeedback() {
  const analytics = useAnalytics();

  return async function sendFeedback(
    from: "feed" | "event",
    event?: Pick<Event, "event_id" | "name" | "venue_name" | "start_time">
  ) {
    analytics.feedbackOpened(from, event?.event_id ?? null);
    const url = feedbackUrl(
      {
        appVersion: Application.nativeApplicationVersion,
        build: Application.nativeBuildVersion,
        device: Device.modelName,
        osVersion: Device.osVersion,
      },
      event
    );
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Send feedback", `Email us at ${FEEDBACK_ADDRESS}. Every message gets read.`);
    }
  };
}

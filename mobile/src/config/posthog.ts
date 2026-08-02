import PostHog from "posthog-react-native";
import Constants from "expo-constants";

const apiKey = Constants.expoConfig?.extra?.postHogKey as string | undefined;
const host =
  (Constants.expoConfig?.extra?.posthogHost as string) || "https://us.i.posthog.com";

const isConfigured = !!apiKey && apiKey.length > 0;

if (!isConfigured && __DEV__) {
  console.warn(
    "PostHog: POSTHOG_KEY not set. Analytics disabled. Add it to your .env file."
  );
}

export const posthog = new PostHog(apiKey || "placeholder_key", {
  host,
  disabled: !isConfigured,
  captureAppLifecycleEvents: true,
  flushAt: 20,
  flushInterval: 10000,
  maxBatchSize: 100,
  maxQueueSize: 1000,
  preloadFeatureFlags: true,
  sendFeatureFlagEvent: true,
  featureFlagsRequestTimeoutMs: 10000,
  requestTimeout: 10000,
  fetchRetryCount: 3,
  fetchRetryDelay: 3000,
});

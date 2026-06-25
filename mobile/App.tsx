import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { PostHogProvider } from "posthog-react-native";
import { PreferencesProvider, usePreferencesContext } from "./src/contexts/PreferencesContext";

const POST_HOG_KEY: string = Constants.expoConfig?.extra?.postHogKey ?? "";
import TonightFeed from "./src/screens/TonightFeed";
import EventDetail from "./src/screens/EventDetail";
import FiltersModal from "./src/screens/FiltersModal";
import WelcomeScreen from "./src/screens/onboarding/WelcomeScreen";
import IdentityScreen from "./src/screens/onboarding/IdentityScreen";
import VibeScreen from "./src/screens/onboarding/VibeScreen";
import BudgetScreen from "./src/screens/onboarding/BudgetScreen";
import ReadyScreen from "./src/screens/onboarding/ReadyScreen";

const Stack = createNativeStackNavigator();
const appEnv: string = Constants.expoConfig?.extra?.appEnv ?? "production";

function EnvBadge() {
  if (appEnv === "production") return null;
  const label = appEnv === "development" ? "DEV" : "STAGING";
  const color = appEnv === "development" ? "#F59E0B" : "#6366F1";
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const stackOpts = {
  headerShown: false,
  contentStyle: { backgroundColor: "#0A0A0A" },
};

const appStackOpts = {
  headerStyle: { backgroundColor: "#0A0A0A" },
  headerTintColor: "#FFFFFF",
  headerTitleStyle: { fontWeight: "700" as const },
  contentStyle: { backgroundColor: "#0A0A0A" },
};

function AppContent() {
const { preferences, loading } = usePreferencesContext();

  if (loading) return null;

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <EnvBadge />
      {preferences.onboardingComplete ? (
        <Stack.Navigator screenOptions={appStackOpts}>
          <Stack.Screen name="TonightFeed" component={TonightFeed} options={{ title: "Tonight in NYC" }} />
          <Stack.Screen name="EventDetail" component={EventDetail as React.ComponentType<any>} options={{ title: "Event" }} />
          <Stack.Screen name="Filters" component={FiltersModal as React.ComponentType<any>} options={{ presentation: "modal", title: "Filters" }} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator screenOptions={stackOpts}>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Identity" component={IdentityScreen} />
          <Stack.Screen name="Vibe" component={VibeScreen} />
          <Stack.Screen name="Budget" component={BudgetScreen} />
          <Stack.Screen name="Ready" component={ReadyScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <PostHogProvider apiKey={POST_HOG_KEY} options={{ host: "https://us.i.posthog.com" }}>
      <PreferencesProvider>
        <AppContent />
      </PreferencesProvider>
    </PostHogProvider>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 56,
    right: 12,
    zIndex: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});

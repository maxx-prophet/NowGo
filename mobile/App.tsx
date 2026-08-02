import React, { useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { PostHogProvider } from "posthog-react-native";
import { PreferencesProvider, usePreferencesContext } from "./src/contexts/PreferencesContext";
import { posthog } from "./src/config/posthog";
import ErrorBoundary from "./src/components/ErrorBoundary";
import TonightFeed from "./src/screens/TonightFeed";
import EventDetail from "./src/screens/EventDetail";
import FiltersModal from "./src/screens/FiltersModal";
import WelcomeScreen from "./src/screens/onboarding/WelcomeScreen";
import IdentityScreen from "./src/screens/onboarding/IdentityScreen";
import VibeScreen from "./src/screens/onboarding/VibeScreen";
import BudgetScreen from "./src/screens/onboarding/BudgetScreen";
import ReadyScreen from "./src/screens/onboarding/ReadyScreen";
import type { RootStackParamList, OnboardingStackParamList } from "./src/types";

const AppStack = createNativeStackNavigator<RootStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
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
  const navigationRef = useRef<any>(null);
  const routeNameRef = useRef<string | undefined>(undefined);

  if (loading) return null;

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        routeNameRef.current = navigationRef.current?.getCurrentRoute()?.name;
      }}
      onStateChange={() => {
        const previous = routeNameRef.current;
        const current = navigationRef.current?.getCurrentRoute()?.name;
        if (current && previous !== current) {
          posthog.screen(current);
          routeNameRef.current = current;
        }
      }}
    >
      <StatusBar style="light" />
      <EnvBadge />
      {preferences.onboardingComplete ? (
        <AppStack.Navigator screenOptions={appStackOpts}>
          <AppStack.Screen name="TonightFeed" component={TonightFeed} options={{ title: "Tonight in NYC" }} />
          <AppStack.Screen name="EventDetail" component={EventDetail} options={{ title: "Event" }} />
          <AppStack.Screen name="Filters" component={FiltersModal} options={{ presentation: "modal", title: "Filters" }} />
        </AppStack.Navigator>
      ) : (
        <OnboardingStack.Navigator screenOptions={stackOpts}>
          <OnboardingStack.Screen name="Welcome" component={WelcomeScreen} />
          <OnboardingStack.Screen name="Identity" component={IdentityScreen} />
          <OnboardingStack.Screen name="Vibe" component={VibeScreen} />
          <OnboardingStack.Screen name="Budget" component={BudgetScreen} />
          <OnboardingStack.Screen name="Ready" component={ReadyScreen} />
        </OnboardingStack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <PostHogProvider
      client={posthog}
      autocapture={{ captureScreens: false, captureTouches: true }}
    >
      <PreferencesProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
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

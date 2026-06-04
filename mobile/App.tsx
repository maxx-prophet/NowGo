import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import TonightFeed from "./src/screens/TonightFeed";
import EventDetail from "./src/screens/EventDetail";
import FiltersModal from "./src/screens/FiltersModal";

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

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <EnvBadge />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: "#0A0A0A" },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#0A0A0A" },
        }}
      >
        <Stack.Screen
          name="TonightFeed"
          component={TonightFeed}
          options={{ title: "Tonight in NYC" }}
        />
        <Stack.Screen
          name="EventDetail"
          component={EventDetail as React.ComponentType<any>}
          options={{ title: "Event" }}
        />
        <Stack.Screen
          name="Filters"
          component={FiltersModal as React.ComponentType<any>}
          options={{ presentation: "modal", title: "Filters" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
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

import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import TonightFeed from "./src/screens/TonightFeed";
import EventDetail from "./src/screens/EventDetail";
import FiltersModal from "./src/screens/FiltersModal";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
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

import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { usePostHog } from "posthog-react-native";
import type { OnboardingNavProp } from "../../types";

export default function WelcomeScreen({ navigation }: { navigation: OnboardingNavProp<"Welcome"> }) {
  const posthog = usePostHog();

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.wordmark}>
          <Text style={styles.wordmarkText}>
            <Text style={styles.gold}>Now</Text>
            <Text style={[styles.gold, styles.italic]}>Go</Text>
          </Text>
        </View>
        <Text style={styles.headline} maxFontSizeMultiplier={1.6}>
          Tonight{"\n"}starts{"\n"}<Text style={styles.gold}>now.</Text>
        </Text>
        <View style={{ height: 24 }} />
        <Text style={styles.sub}>
          NYC events, ranked for you.{"\n"}Leave on time. Never miss out.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => { posthog?.capture("onboarding_started"); navigation.navigate("Identity"); }}
        >
          <Text style={styles.btnText}>Get started →</Text>
        </TouchableOpacity>
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  // Without a scroll view this was a fixed flex:1 column: at large Dynamic
  // Type sizes the content and the button below it were clipped off-screen
  // with no way to reach them.
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 16,
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 56,
    paddingTop: 12,
    backgroundColor: "#0A0A0A",
  },
  wordmark: { marginBottom: 56 },
  wordmarkText: { fontSize: 36, fontWeight: "800", letterSpacing: -1 },
  gold: { color: "#F5A623" },
  italic: { fontStyle: "italic" },
  headline: {
    fontSize: 48,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 50,
    letterSpacing: -1.5,
    marginBottom: 20,
  },
  sub: { fontSize: 17, color: "#6B7280", lineHeight: 26 },
  btn: {
    backgroundColor: "#F5A623",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
  },
  btnText: { fontSize: 17, fontWeight: "700", color: "#0A0A0A" },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#2A2A2A" },
  dotActive: { width: 20, backgroundColor: "#F5A623" },
});

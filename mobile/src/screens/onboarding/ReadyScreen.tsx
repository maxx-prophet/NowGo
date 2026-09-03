import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { usePreferencesContext } from "../../contexts/PreferencesContext";
import { usePostHog } from "posthog-react-native";
import BackButton from "../../components/BackButton";
import type { OnboardingNavProp } from "../../types";

const IDENTITY_LABELS: Record<string, string> = {
  local: "Born & bred local",
  transplant: "Transplant",
  visitor: "Just visiting",
};

function budgetLabel(max: number | null): string {
  if (max === 0) return "Free only";
  if (max === null) return "No limit ($500+)";
  return `Up to $${max}`;
}

export default function ReadyScreen({ navigation }: { navigation: OnboardingNavProp<"Ready"> }) {
  const { preferences, completeOnboarding, savePreferences } = usePreferencesContext();
  const posthog = usePostHog();

  async function onFinish() {
    posthog?.capture("onboarding_completed", {
      identity: preferences.identity,
      vibes: preferences.vibes,
      vibe_count: preferences.vibes.length,
      budget_max: preferences.budgetMax,
    });
    const distinctId = posthog?.getDistinctId();
    posthog?.identify(distinctId ?? "anonymous", {
      $set: {
        identity: preferences.identity,
        vibes: preferences.vibes,
        budget_max: preferences.budgetMax,
      },
      $set_once: { onboarding_completed_at: new Date().toISOString() },
    });
    await completeOnboarding({
      identity: preferences.identity,
      vibes: preferences.vibes,
      budgetMax: preferences.budgetMax,
    });
  }

  function onBack() {
    navigation.navigate("Budget");
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <BackButton onPress={onBack} />
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.key}>YOU ARE</Text>
            <Text style={[styles.val, styles.gold]}>
              {IDENTITY_LABELS[preferences.identity] ?? preferences.identity}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.key}>VIBES</Text>
            <Text style={styles.val}>
              {preferences.vibes.length > 0 ? preferences.vibes.join(" · ") : "None selected"}
            </Text>
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.key}>BUDGET</Text>
            <Text style={[styles.val, styles.gold]}>
              {budgetLabel(preferences.budgetMax)}
            </Text>
          </View>
        </View>

        <Text style={styles.headline} maxFontSizeMultiplier={1.6}>
          You're all{"\n"}set. <Text style={styles.gold}>Go.</Text>
        </Text>
        <View style={{ height: 16 }} />
        <Text style={styles.sub}>
          Tonight's events, ranked for you.{"\n"}Change this anytime in settings.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btn} onPress={onFinish}>
          <Text style={styles.btnText}>Show me tonight →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSecondary} onPress={onBack}>
          <Text style={styles.btnSecondaryText}>Change preferences</Text>
        </TouchableOpacity>
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotDone]} />
          <View style={[styles.dot, styles.dotDone]} />
          <View style={[styles.dot, styles.dotDone]} />
          <View style={[styles.dot, styles.dotDone]} />
          <View style={[styles.dot, styles.dotActive]} />
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
  card: {
    backgroundColor: "#1A1A1A",
    borderWidth: 1.5,
    borderColor: "#2A2A2A",
    borderRadius: 24,
    padding: 24,
    marginBottom: 40,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
  },
  rowLast: { borderBottomWidth: 0 },
  key: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#4B5563",
  },
  val: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "right",
    flex: 1,
    marginLeft: 12,
  },
  gold: { color: "#F5A623" },
  headline: {
    fontSize: 42,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 44,
    letterSpacing: -1.5,
  },
  sub: { fontSize: 16, color: "#6B7280", lineHeight: 24 },
  btn: {
    backgroundColor: "#F5A623",
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: "center",
    marginBottom: 12,
  },
  btnText: { fontSize: 18, fontWeight: "800", color: "#0A0A0A", letterSpacing: -0.3 },
  btnSecondary: { alignItems: "center", paddingVertical: 4 },
  btnSecondaryText: { fontSize: 14, color: "#4B5563", fontWeight: "500" },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#2A2A2A" },
  dotActive: { width: 20, backgroundColor: "#F5A623" },
  dotDone: { backgroundColor: "#F5A623" },
});

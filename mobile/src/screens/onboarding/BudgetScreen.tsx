import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { usePreferencesContext } from "../../contexts/PreferencesContext";

const SNAPS: { label: string; value: number | null; sub: string }[] = [
  { label: "Free", value: 0, sub: "No tickets, no problem" },
  { label: "$50", value: 50, sub: "Good for most shows & events" },
  { label: "$100", value: 100, sub: "Opens up most paid shows" },
  { label: "$250", value: 250, sub: "For premium events" },
  { label: "$500+", value: null, sub: "No limit" },
];

export default function BudgetScreen({ navigation }: { navigation: any }) {
  const { preferences, savePreferences } = usePreferencesContext();
  const [budget, setBudget] = useState<number | null>(preferences.budgetMax);

  const snapIndex = SNAPS.findIndex((s) => s.value === budget);
  const activeSnap = SNAPS[snapIndex] ?? SNAPS[1];
  const fillPercent = snapIndex <= 0 ? 0 : (snapIndex / (SNAPS.length - 1)) * 100;

  async function onContinue() {
    await savePreferences({ budgetMax: budget });
    navigation.navigate("Ready");
  }

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.stepLabel}>STEP 4 OF 5</Text>
        <Text style={styles.headline}>What's your{"\n"}budget tonight?</Text>
        <Text style={styles.sub}>Tap to set your max spend.</Text>

        <View style={styles.priceDisplay}>
          <Text style={styles.priceLabel}>UP TO</Text>
          <Text style={styles.priceValue}>
            {activeSnap.value === 0 ? "Free" : activeSnap.value === null ? "$500+" : `$${activeSnap.value}`}
          </Text>
          <Text style={styles.priceSub}>{activeSnap.sub}</Text>
        </View>

        <View style={styles.sliderContainer}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${fillPercent}%` as any }]} />
            <View style={[styles.thumb, { left: `${fillPercent}%` as any }]} />
          </View>
          <View style={styles.ticks}>
            {SNAPS.map((s) => (
              <Text key={s.label} style={styles.tickLabel}>{s.label}</Text>
            ))}
          </View>
        </View>

        <View style={styles.chips}>
          {SNAPS.map((s) => (
            <TouchableOpacity
              key={s.label}
              style={[styles.chip, budget === s.value && styles.chipActive]}
              onPress={() => setBudget(s.value)}
            >
              <Text style={[styles.chipText, budget === s.value && styles.chipTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View>
        <TouchableOpacity style={styles.btn} onPress={onContinue}>
          <Text style={styles.btnText}>Continue →</Text>
        </TouchableOpacity>
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotDone]} />
          <View style={[styles.dot, styles.dotDone]} />
          <View style={[styles.dot, styles.dotDone]} />
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 56,
    justifyContent: "space-between",
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#F5A623",
    marginBottom: 20,
  },
  headline: {
    fontSize: 36,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 40,
    letterSpacing: -1,
    marginBottom: 8,
  },
  sub: { fontSize: 15, color: "#6B7280", lineHeight: 22 },
  priceDisplay: { marginTop: 44, alignItems: "center" },
  priceLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
    letterSpacing: 1,
    marginBottom: 8,
  },
  priceValue: {
    fontSize: 72,
    fontWeight: "800",
    color: "#F5A623",
    letterSpacing: -4,
    lineHeight: 76,
  },
  priceSub: { fontSize: 14, color: "#6B7280", marginTop: 8 },
  sliderContainer: { marginTop: 44 },
  track: {
    height: 6,
    backgroundColor: "#2A2A2A",
    borderRadius: 3,
    marginBottom: 12,
    position: "relative",
    overflow: "visible",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#F5A623",
    borderRadius: 3,
  },
  thumb: {
    position: "absolute",
    top: "50%",
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#F5A623",
    marginTop: -13,
    marginLeft: -13,
    shadowColor: "#F5A623",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  ticks: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tickLabel: { fontSize: 11, color: "#4B5563", fontWeight: "500" },
  chips: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 28,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#1A1A1A",
    borderWidth: 1.5,
    borderColor: "#2A2A2A",
    borderRadius: 20,
  },
  chipActive: { borderColor: "#F5A623", backgroundColor: "#1F1A10" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  chipTextActive: { color: "#F5A623" },
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
  dotDone: { backgroundColor: "#F5A623" },
});

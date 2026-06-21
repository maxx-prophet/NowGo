import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { usePreferencesContext } from "../../contexts/PreferencesContext";

const VIBES = [
  { label: "Jazz", emoji: "🎷" },
  { label: "Comedy", emoji: "😂" },
  { label: "Theater", emoji: "🎭" },
  { label: "Art", emoji: "🎨" },
  { label: "Outdoors", emoji: "🌿" },
  { label: "Sports", emoji: "🏆" },
  { label: "Film", emoji: "🎬" },
  { label: "Nightlife", emoji: "🌙" },
  { label: "Talks", emoji: "🎤" },
  { label: "Family", emoji: "👨‍👩‍👧" },
];

export default function VibeScreen({ navigation }: { navigation: any }) {
  const { preferences, savePreferences } = usePreferencesContext();
  const [selected, setSelected] = useState<string[]>(preferences.vibes);

  function toggle(label: string) {
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((v) => v !== label) : [...prev, label]
    );
  }

  async function onContinue() {
    await savePreferences({ vibes: selected });
    navigation.navigate("Budget");
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.stepLabel}>STEP 3 OF 5</Text>
        <Text style={styles.headline}>What's your{"\n"}vibe?</Text>
        <Text style={styles.sub}>Pick as many as you like.</Text>

        <View style={styles.grid}>
          {VIBES.map((v) => {
            const active = selected.includes(v.label);
            return (
              <TouchableOpacity
                key={v.label}
                style={[styles.chip, active && styles.chipSelected]}
                onPress={() => toggle(v.label)}
              >
                <Text style={styles.chipEmoji}>{v.emoji}</Text>
                <Text style={[styles.chipLabel, active && styles.chipLabelSelected]}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selected.length > 0 && (
          <Text style={styles.hint}>{selected.length} selected</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btn} onPress={onContinue}>
          <Text style={styles.btnText}>Continue →</Text>
        </TouchableOpacity>
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotDone]} />
          <View style={[styles.dot, styles.dotDone]} />
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 16,
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
  sub: { fontSize: 15, color: "#6B7280", lineHeight: 22, marginBottom: 28 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    width: "30%",
    backgroundColor: "#1A1A1A",
    borderWidth: 1.5,
    borderColor: "#2A2A2A",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 8,
  },
  chipSelected: { borderColor: "#F5A623", backgroundColor: "#1F1A10" },
  chipEmoji: { fontSize: 28 },
  chipLabel: { fontSize: 12, fontWeight: "600", color: "#9CA3AF", textAlign: "center" },
  chipLabelSelected: { color: "#F5A623" },
  hint: { fontSize: 12, color: "#4B5563", textAlign: "center", marginTop: 16 },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 56,
    paddingTop: 12,
    backgroundColor: "#0A0A0A",
  },
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

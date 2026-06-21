import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { usePreferencesContext } from "../../contexts/PreferencesContext";
import type { UserIdentity } from "../../types";

const CHOICES: { value: UserIdentity; emoji: string; title: string; desc: string }[] = [
  { value: "local", emoji: "🗽", title: "Born & bred local", desc: "I know the city — show me what I'm missing" },
  { value: "transplant", emoji: "🧳", title: "Transplant", desc: "Still exploring — help me discover NYC" },
  { value: "visitor", emoji: "✈️", title: "Just visiting", desc: "In town for a bit — show me the best of it" },
];

export default function IdentityScreen({ navigation }: { navigation: any }) {
  const { preferences, savePreferences } = usePreferencesContext();
  const [selected, setSelected] = useState<UserIdentity>(preferences.identity);

  async function onContinue() {
    await savePreferences({ identity: selected });
    navigation.navigate("Vibe");
  }

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.stepLabel}>STEP 2 OF 5</Text>
        <Text style={styles.headline}>Are you a New{"\n"}Yorker?</Text>
        <View style={{ height: 8 }} />
        <Text style={styles.sub}>Helps us surface the right mix of events for you.</Text>

        <View style={styles.choices}>
          {CHOICES.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[styles.choice, selected === c.value && styles.choiceSelected]}
              onPress={() => setSelected(c.value)}
            >
              <Text style={styles.choiceEmoji}>{c.emoji}</Text>
              <View style={styles.choiceText}>
                <Text style={styles.choiceTitle}>{c.title}</Text>
                <Text style={styles.choiceDesc}>{c.desc}</Text>
              </View>
              <View style={[styles.check, selected === c.value && styles.checkSelected]}>
                {selected === c.value && <View style={styles.checkInner} />}
              </View>
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
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
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
  },
  sub: { fontSize: 15, color: "#6B7280", lineHeight: 22 },
  choices: { marginTop: 40, gap: 12 },
  choice: {
    backgroundColor: "#1A1A1A",
    borderWidth: 1.5,
    borderColor: "#2A2A2A",
    borderRadius: 20,
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  choiceSelected: { borderColor: "#F5A623", backgroundColor: "#1F1A10" },
  choiceEmoji: { fontSize: 32 },
  choiceText: { flex: 1 },
  choiceTitle: { fontSize: 17, fontWeight: "700", color: "#FFFFFF", marginBottom: 4 },
  choiceDesc: { fontSize: 13, color: "#6B7280", lineHeight: 18 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  checkSelected: { backgroundColor: "#F5A623", borderColor: "#F5A623" },
  checkInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#0A0A0A" },
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

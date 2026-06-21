import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function WelcomeScreen({ navigation }: { navigation: any }) {
  return (
    <View style={styles.container}>
      <View>
        <View style={styles.wordmark}>
          <Text style={styles.wordmarkText}>
            <Text style={styles.gold}>Now</Text>
            <Text style={[styles.gold, styles.italic]}>Go</Text>
          </Text>
        </View>
        <Text style={styles.headline}>
          Tonight{"\n"}starts{"\n"}<Text style={styles.gold}>now.</Text>
        </Text>
        <View style={{ height: 24 }} />
        <Text style={styles.sub}>
          NYC events, ranked for you.{"\n"}Leave on time. Never miss out.
        </Text>
      </View>

      <View>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => navigation.navigate("Identity")}
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
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 56,
    justifyContent: "space-between",
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

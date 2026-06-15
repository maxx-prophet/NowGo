import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

type ParamList = { Filters: { mode: "transit" | "walk" | "drive"; onApply: (mode: "transit" | "walk" | "drive") => void } };

interface Props {
  route: RouteProp<ParamList, "Filters">;
  navigation: NativeStackNavigationProp<any>;
}

const MODES: Array<{ key: "transit" | "walk" | "drive"; label: string; desc: string }> = [
  { key: "transit",  label: "🚇 Transit",  desc: "Subway & bus" },
  { key: "walk",  label: "🚶 Walking",  desc: "On foot" },
  { key: "drive",  label: "🚗 Driving",  desc: "By car" },
];

export default function FiltersModal({ route, navigation }: Props) {
  const { mode: initialMode, onApply } = route.params;
  const [mode, setMode] = useState(initialMode);

  const apply = () => {
    onApply(mode);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Travel Mode</Text>
      <Text style={styles.sub}>
        Used to calculate your leave-by time for each event.
      </Text>

      {MODES.map((m) => (
        <TouchableOpacity
          key={m.key}
          style={[styles.modeRow, mode === m.key && styles.modeRowActive]}
          onPress={() => setMode(m.key as "transit" | "walk" | "drive")}
        >
          <View style={styles.modeInfo}>
            <Text style={styles.modeLabel}>{m.label}</Text>
            <Text style={styles.modeDesc}>{m.desc}</Text>
          </View>
          <View style={[styles.radio, mode === m.key && styles.radioActive]}>
            {mode === m.key && <View style={styles.radioDot} />}
          </View>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.applyBtn} onPress={apply}>
        <Text style={styles.applyText}>Apply</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A", padding: 24 },
  heading: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", marginBottom: 6 },
  sub: { color: "#6B7280", fontSize: 14, marginBottom: 28 },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  modeRowActive: { borderColor: "#FF6B35" },
  modeInfo: { flex: 1 },
  modeLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "600", marginBottom: 2 },
  modeDesc: { color: "#6B7280", fontSize: 13 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  radioActive: { borderColor: "#FF6B35" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF6B35" },
  applyBtn: {
    backgroundColor: "#FF6B35",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  applyText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});

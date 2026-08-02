import React, { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, Modal, Switch, StyleSheet,
} from "react-native";
import { useAnalytics } from "../services/analytics";

type SortBy = "best" | "soonest" | "nearest" | "cheapest";

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "best",     label: "Best Match" },
  { key: "soonest",  label: "Soonest" },
  { key: "nearest",  label: "Nearest" },
  { key: "cheapest", label: "Cheapest" },
];

interface Props {
  visible: boolean;
  sortBy: SortBy;
  walkInsOnly: boolean;
  onApply: (sortBy: SortBy, walkInsOnly: boolean) => void;
  onClose: () => void;
}

export default function FilterSheet({ visible, sortBy, walkInsOnly, onApply, onClose }: Props) {
  const [draftSortBy, setDraftSortBy] = useState<SortBy>(sortBy);
  const [draftWalkInsOnly, setDraftWalkInsOnly] = useState(walkInsOnly);
  const analytics = useAnalytics();

  useEffect(() => {
    if (visible) {
      setDraftSortBy(sortBy);
      setDraftWalkInsOnly(walkInsOnly);
    }
  }, [visible, sortBy, walkInsOnly]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={styles.sheet}>
          <Text style={styles.sheetHeading}>Sort By</Text>
          <View style={styles.sortGrid}>
            {SORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.sortOption, draftSortBy === opt.key && styles.sortOptionActive]}
                onPress={() => setDraftSortBy(opt.key)}
              >
                <Text style={[styles.sortOptionText, draftSortBy === opt.key && styles.sortOptionTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sheetHeading}>Availability</Text>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Walk-ins only</Text>
              <Text style={styles.toggleSub}>No ticket required</Text>
            </View>
            <Switch
              value={draftWalkInsOnly}
              onValueChange={setDraftWalkInsOnly}
              trackColor={{ false: "#2A2A2A", true: "#FF6B35" }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#2A2A2A"
            />
          </View>

          <TouchableOpacity
            style={styles.showResultsBtn}
            onPress={() => {
              if (draftSortBy !== sortBy) analytics.sortChanged(draftSortBy);
              if (draftWalkInsOnly !== walkInsOnly) analytics.walkInsFilterToggled(draftWalkInsOnly);
              onApply(draftSortBy, draftWalkInsOnly);
              onClose();
            }}
          >
            <Text style={styles.showResultsText}>Show results</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#111111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHeading: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 8,
  },
  sortGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  sortOption: {
    width: "47%",
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#1A1A1A",
    borderWidth: 1.5,
    borderColor: "#2A2A2A",
  },
  sortOptionActive: { backgroundColor: "#F5A623", borderColor: "#F5A623" },
  sortOptionText: { color: "#9CA3AF", fontSize: 14, fontWeight: "500" },
  sortOptionTextActive: { color: "#111111", fontWeight: "700" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  toggleLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "500" },
  toggleSub: { color: "#6B7280", fontSize: 13, marginTop: 2 },
  showResultsBtn: {
    backgroundColor: "#FF6B35",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  showResultsText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});

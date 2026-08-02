import React, { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, Modal, ActivityIndicator, StyleSheet,
} from "react-native";
import type { Event } from "../types";
import EventCard from "./EventCard";

interface Props {
  visible: boolean;
  events: Event[];
  loading: boolean;
  onClose: () => void;
  onNavigate: (event: Event) => void;
}

export default function SurpriseSheet({ visible, events, loading, onClose, onNavigate }: Props) {
  const [surpriseIndex, setSurpriseIndex] = useState(0);

  useEffect(() => {
    if (visible) setSurpriseIndex(0);
  }, [visible, events]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={styles.sheet}>
          <Text style={styles.sheetHeading}>🎲 Tonight's Pick</Text>

          {loading ? (
            <ActivityIndicator color="#FF6B35" size="large" style={{ marginVertical: 32 }} />
          ) : events.length === 0 ? (
            <Text style={styles.surpriseEmpty}>
              No events in the next 90 min that are confirmed available. Check back soon!
            </Text>
          ) : (
            <>
              <EventCard
                event={events[surpriseIndex]}
                index={0}
                onPress={() => {
                  onClose();
                  onNavigate(events[surpriseIndex]);
                }}
              />
              <View style={styles.surpriseNav}>
                <Text style={styles.surpriseCount}>
                  {surpriseIndex + 1} of {events.length}
                </Text>
                {surpriseIndex < events.length - 1 && (
                  <TouchableOpacity onPress={() => setSurpriseIndex((i) => i + 1)}>
                    <Text style={styles.surpriseNext}>Try another →</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
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
  surpriseEmpty: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 24,
    lineHeight: 22,
  },
  surpriseNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingHorizontal: 4,
  },
  surpriseCount: { color: "#4B5563", fontSize: 13 },
  surpriseNext: { color: "#FF6B35", fontSize: 14, fontWeight: "600" },
});

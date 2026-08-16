import React from "react";
import {
  View, Text, TouchableOpacity, Modal, ActivityIndicator, StyleSheet,
} from "react-native";
import type { Event } from "../types";
import EventCard from "./EventCard";

interface Props {
  visible: boolean;
  events: Event[];
  loading: boolean;
  /** Dismissed without taking the pick — backdrop tap or hardware back. */
  onClose: () => void;
  /** Took the pick. The parent closes the sheet and navigates. */
  onAccept: (event: Event, index: number) => void;
  /** Rejected this pick and asked for the next one. */
  onSkip: (index: number) => void;
  /**
   * Which pick is showing. Owned by the parent rather than held here: the
   * parent has to report it when the sheet is dismissed, and two copies of
   * the same index drift as soon as `events` reloads while the sheet is open.
   */
  surpriseIndex: number;
}

export default function SurpriseSheet({
  visible, events, loading, onClose, onAccept, onSkip, surpriseIndex,
}: Props) {
  // Guard against the parent's index outliving a shorter refreshed list.
  const index = Math.min(surpriseIndex, Math.max(events.length - 1, 0));

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
                event={events[index]}
                index={0}
                onPress={() => onAccept(events[index], index)}
              />
              <View style={styles.surpriseNav}>
                <Text style={styles.surpriseCount}>
                  {index + 1} of {events.length}
                </Text>
                {index < events.length - 1 && (
                  <TouchableOpacity onPress={() => onSkip(index)}>
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

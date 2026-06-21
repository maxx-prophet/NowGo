import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, Linking, StyleSheet, ActivityIndicator } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { Event } from "../types";
import { fetchTravel } from "../api/nowgo";
import { getAvailabilityBadge } from "../components/eventCardHelpers";

type TravelMode = "transit" | "walk" | "drive";

type ParamList = {
  EventDetail: {
    event: Event;
    userLat?: number | null;
    userLng?: number | null;
    initialMode?: TravelMode;
  };
};

interface Props {
  route: RouteProp<ParamList, "EventDetail">;
  navigation: NativeStackNavigationProp<any>;
}

const MODES: { key: TravelMode; emoji: string; label: string }[] = [
  { key: "transit", emoji: "🚇", label: "Transit" },
  { key: "walk",    emoji: "🚶", label: "Walk" },
  { key: "drive",   emoji: "🚗", label: "Drive" },
];


function formatStartTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "America/New_York",
  });
}

function formatPrice(min: number | null | undefined, max: number | null | undefined, isFree: boolean) {
  if (isFree) return "Free";
  if (min == null && max == null) return "Price unavailable";
  if (max == null || min === max) return `$${Number(min).toFixed(2)}`;
  return `$${Number(min).toFixed(2)} – $${Number(max).toFixed(2)}`;
}

function leaveByDisplay(leaveBy: string | null | undefined): { label: string; color: string } | null {
  if (!leaveBy) return null;
  const diffMin = (new Date(leaveBy).getTime() - Date.now()) / 60_000;
  if (diffMin < -5) return { label: "Event is underway",    color: "#6B7280" };
  if (diffMin <= 0)  return { label: "Leave RIGHT NOW",      color: "#EF4444" };
  if (diffMin < 30)  return { label: `Leave in ${Math.ceil(diffMin)} min`, color: "#F97316" };
  const t = new Date(leaveBy).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York",
  });
  return { label: `Leave by ${t}`, color: "#22C55E" };
}

export default function EventDetail({ route }: Props) {
  const { event, userLat, userLng, initialMode = "transit" } = route.params;

  const hasGeo = userLat != null && userLng != null
    && event.venue_lat != null && event.venue_lng != null;

  const [mode, setMode] = useState<TravelMode>(initialMode);
  const [travelMinutes, setTravelMinutes] = useState<number | null>(event.travel_minutes ?? null);
  const [distanceKm, setDistanceKm] = useState<number | null>(event.travel_distance_km ?? null);
  const [leaveBy, setLeaveBy] = useState<string | null | undefined>(event.leave_by);
  const [travelSource, setTravelSource] = useState<string | null>(event.travel_source ?? null);
  const [travelLoading, setTravelLoading] = useState(false);

  async function switchMode(newMode: TravelMode) {
    if (newMode === mode || !hasGeo) return;
    setMode(newMode);
    setTravelLoading(true);
    try {
      const result = await fetchTravel({
        fromLat: userLat!, fromLng: userLng!,
        toLat: event.venue_lat!, toLng: event.venue_lng!,
        mode: newMode, startTime: event.start_time,
      });
      setTravelMinutes(result.travel_minutes);
      setDistanceKm(result.distance_km);
      setLeaveBy(result.leave_by);
      setTravelSource(result.travel_source);
    } catch {
      // keep previous values on error
    } finally {
      setTravelLoading(false);
    }
  }

  const lb = leaveByDisplay(leaveBy);
  const badge = getAvailabilityBadge(event.availability_tier, event.start_time);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Badge row */}
      <View style={styles.badgeRow}>
        {event.segment ? <Text style={styles.segmentTag}>{event.segment}</Text> : null}
        {badge ? (
          <View style={[styles.availBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.availBadgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        ) : null}
      </View>

      {/* Title */}
      <Text style={styles.title}>{event.name}</Text>

      {/* Hook */}
      {event.hook ? (
        <Text style={styles.hook}>"{event.hook}"</Text>
      ) : null}

      {/* Venue */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>VENUE</Text>
        <Text style={styles.sectionValue}>{event.venue_name ?? "Venue TBD"}</Text>
        {event.venue_address ? <Text style={styles.sectionSub}>{event.venue_address}</Text> : null}
        {event.neighborhood ? <Text style={styles.neighborhood}>{event.neighborhood}</Text> : null}
      </View>

      {/* Start time */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>START TIME</Text>
        <Text style={styles.sectionValue}>{formatStartTime(event.start_time)}</Text>
      </View>

      {/* Price */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PRICE</Text>
        <Text style={styles.sectionValue}>{formatPrice(event.price_min, event.price_max, event.is_free)}</Text>
      </View>

      {/* Leave-by card */}
      {(lb || hasGeo) ? (
        <View style={[styles.leaveCard, lb && { borderColor: lb.color }]}>
          <Text style={styles.leaveCardLabel}>YOUR LEAVE TIME</Text>

          {/* Mode toggle — only shown when we have both user + venue coords */}
          {hasGeo && (
            <View style={styles.modeToggle}>
              {MODES.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]}
                  onPress={() => switchMode(m.key)}
                >
                  <Text style={styles.modeBtnText}>{m.emoji} {m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {travelLoading ? (
            <ActivityIndicator color="#FF6B35" style={{ marginVertical: 12 }} />
          ) : lb ? (
            <Text style={[styles.leaveCardValue, { color: lb.color }]}>{lb.label}</Text>
          ) : (
            <Text style={styles.leaveCardUnknown}>Travel time unavailable</Text>
          )}

          {travelMinutes != null && !travelLoading && (
            <Text style={styles.leaveCardSub}>
              ~{travelMinutes} min{travelSource === "distance_estimate" ? " (estimated)" : ""}
              {distanceKm != null ? ` · ${distanceKm} km` : ""}
            </Text>
          )}
        </View>
      ) : null}

      {/* CTA */}
      {event.url ? (
        <TouchableOpacity style={styles.ticketsBtn} onPress={() => Linking.openURL(event.url!)}>
          <Text style={styles.ticketsBtnText}>Get Tickets →</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.noTicketsNote}>
          <Text style={styles.noTicketsText}>Walk-in or check venue for tickets</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  content: { padding: 20, paddingBottom: 48 },

  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  segmentTag: {
    backgroundColor: "#1A1A1A",
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  availBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  availBadgeText: { fontSize: 11, fontWeight: "600" },

  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "700", lineHeight: 30, marginBottom: 10 },
  hook: { color: "#9CA3AF", fontSize: 15, fontStyle: "italic", marginBottom: 24, lineHeight: 22 },

  section: { marginBottom: 20 },
  sectionLabel: {
    color: "#4B5563", fontSize: 11, fontWeight: "700",
    letterSpacing: 1, textTransform: "uppercase", marginBottom: 4,
  },
  sectionValue: { color: "#FFFFFF", fontSize: 16 },
  sectionSub: { color: "#9CA3AF", fontSize: 14, marginTop: 2 },
  neighborhood: { color: "#FF6B35", fontSize: 13, fontWeight: "600", marginTop: 4 },

  leaveCard: {
    borderWidth: 1.5,
    borderColor: "#2A2A2A",
    borderRadius: 14,
    padding: 18,
    marginBottom: 24,
  },
  leaveCardLabel: {
    color: "#4B5563", fontSize: 11, fontWeight: "700",
    letterSpacing: 1, textTransform: "uppercase", marginBottom: 12,
  },
  modeToggle: { flexDirection: "row", gap: 8, marginBottom: 14 },
  modeBtn: {
    flex: 1, paddingVertical: 8, alignItems: "center",
    borderRadius: 8, backgroundColor: "#1A1A1A",
    borderWidth: 1, borderColor: "#2A2A2A",
  },
  modeBtnActive: { backgroundColor: "#FF6B35", borderColor: "#FF6B35" },
  modeBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  leaveCardValue: { fontSize: 28, fontWeight: "800", marginBottom: 6 },
  leaveCardUnknown: { color: "#4B5563", fontSize: 16, marginBottom: 6 },
  leaveCardSub: { color: "#6B7280", fontSize: 13 },

  ticketsBtn: {
    backgroundColor: "#FF6B35", borderRadius: 12,
    paddingVertical: 16, alignItems: "center",
  },
  ticketsBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  noTicketsNote: {
    borderWidth: 1, borderColor: "#2A2A2A", borderRadius: 12,
    paddingVertical: 16, alignItems: "center",
  },
  noTicketsText: { color: "#6B7280", fontSize: 15 },
});

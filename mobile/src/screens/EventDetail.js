import { View, Text, ScrollView, TouchableOpacity, Linking, StyleSheet } from "react-native";

function formatTime(iso) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
}

function leaveByDisplay(leaveBy) {
  if (!leaveBy) return null;
  const now = Date.now();
  const leaveMs = new Date(leaveBy).getTime();
  const diffMin = Math.round((leaveMs - now) / 60_000);

  if (diffMin < -5) return { label: "Event is underway", color: "#6B7280" };
  if (diffMin <= 0)  return { label: "Leave RIGHT NOW", color: "#EF4444" };
  if (diffMin < 30) return { label: `Leave in ${diffMin} minutes`, color: "#F97316" };

  const t = new Date(leaveBy).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York",
  });
  return { label: `Leave by ${t}`, color: "#22C55E" };
}

function formatPrice(min, max, isFree) {
  if (isFree) return "Free";
  if (!min && !max) return "Price unavailable";
  if (!max || min === max) return `$${min.toFixed(2)}`;
  return `$${min.toFixed(2)} – $${max.toFixed(2)}`;
}

export default function EventDetail({ route, navigation }) {
  const { event } = route.params;
  const lb = leaveByDisplay(event.leave_by);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Category + availability */}
      <View style={styles.tagRow}>
        {event.segment ? <Text style={styles.tag}>{event.segment}</Text> : null}
        {event.genre ? <Text style={styles.tag}>{event.genre}</Text> : null}
        <Text style={[styles.tag, event.availability_tier === "available" && styles.tagAvailable]}>
          {event.availability_tier}
        </Text>
      </View>

      {/* Title */}
      <Text style={styles.title}>{event.name}</Text>

      {/* Venue */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>VENUE</Text>
        <Text style={styles.sectionValue}>{event.venue_name ?? "Venue TBD"}</Text>
        {event.venue_address ? (
          <Text style={styles.sectionSub}>{event.venue_address}</Text>
        ) : null}
        {event.neighborhood ? (
          <Text style={styles.neighborhood}>{event.neighborhood}</Text>
        ) : null}
      </View>

      {/* Start time */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>START TIME</Text>
        <Text style={styles.sectionValue}>{formatTime(event.start_time)}</Text>
      </View>

      {/* Price */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PRICE</Text>
        <Text style={styles.sectionValue}>{formatPrice(event.price_min, event.price_max, event.is_free)}</Text>
      </View>

      {/* Leave by — the hero card */}
      {lb && (
        <View style={[styles.leaveCard, { borderColor: lb.color }]}>
          <Text style={styles.leaveCardLabel}>YOUR LEAVE TIME</Text>
          <Text style={[styles.leaveCardValue, { color: lb.color }]}>{lb.label}</Text>
          {event.travel_minutes != null && (
            <Text style={styles.leaveCardSub}>
              ~{event.travel_minutes} min {event.travel_source === "distance_estimate" ? "estimated" : ""} travel
              {event.travel_distance_km != null ? ` · ${event.travel_distance_km} km` : ""}
            </Text>
          )}
        </View>
      )}

      {/* Tickets button */}
      {event.url ? (
        <TouchableOpacity
          style={styles.ticketsBtn}
          onPress={() => Linking.openURL(event.url)}
        >
          <Text style={styles.ticketsBtnText}>Get Tickets →</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  content: { padding: 20, paddingBottom: 48 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  tag: {
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
  tagAvailable: { backgroundColor: "#14532D", color: "#4ADE80" },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
    marginBottom: 24,
  },
  section: { marginBottom: 20 },
  sectionLabel: {
    color: "#4B5563",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sectionValue: { color: "#FFFFFF", fontSize: 16 },
  sectionSub: { color: "#9CA3AF", fontSize: 14, marginTop: 2 },
  neighborhood: {
    color: "#FF6B35",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  leaveCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 20,
    marginTop: 8,
    marginBottom: 24,
  },
  leaveCardLabel: {
    color: "#4B5563",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  leaveCardValue: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 6,
  },
  leaveCardSub: { color: "#6B7280", fontSize: 13 },
  ticketsBtn: {
    backgroundColor: "#FF6B35",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  ticketsBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { Event } from "../types";

const SEGMENTS: Record<string, { color: string; emoji: string }> = {
  Music: { color: "#FF6B35", emoji: "🎵" },
  Theatre: { color: "#A855F7", emoji: "🎭" },
  Sports: { color: "#3B82F6", emoji: "🏆" },
  "Arts & Theatre": { color: "#A855F7", emoji: "🎨" },
  Comedy: { color: "#F59E0B", emoji: "😂" },
  Family: { color: "#10B981", emoji: "👨‍👩‍👧" },
};

function leaveByDisplay(leaveBy: string | null | undefined) {
  if (!leaveBy) return null;
  const now = Date.now();
  const leaveMs = new Date(leaveBy).getTime();
  const diffMin = Math.round((leaveMs - now) / 60_000);

  if (diffMin < -5) return { label: "Underway", color: "#6B7280" };
  if (diffMin <= 0)  return { label: "Leave NOW", color: "#EF4444" };
  if (diffMin < 30) return { label: `Leave in ${diffMin}m`, color: "#F97316" };
  return { label: `Leave by ${formatTime(leaveBy)}`, color: "#22C55E" };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
}

function formatPrice(min: number | null | undefined, max: number | null | undefined, isFree: boolean) {
  if (isFree) return "FREE";
  if (!min && !max) return "—";
  if (!max || min === max) return `$${Math.round(min!)}`;
  return `$${Math.round(min!)}–$${Math.round(max)}`;
}

interface EventCardProps {
  event: Event;
  onPress: () => void;
}

export default function EventCard({ event, onPress }: EventCardProps) {
  const seg = SEGMENTS[event.segment ?? ""] ?? { color: "#6B7280", emoji: "📅" };
  const lb = leaveByDisplay(event.leave_by);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.row}>
        <View style={[styles.segDot, { backgroundColor: seg.color }]} />
        <Text style={styles.time}>{formatTime(event.start_time)}</Text>
        <Text style={styles.price}>{formatPrice(event.price_min, event.price_max, event.is_free)}</Text>
      </View>

      <Text style={styles.name} numberOfLines={2}>{event.name}</Text>
      <Text style={styles.venue} numberOfLines={1}>
        {seg.emoji} {event.venue_name ?? "Venue TBD"}
        {event.neighborhood ? ` · ${event.neighborhood}` : ""}
      </Text>

      {lb && (
        <View style={[styles.leaveBadge, { borderColor: lb.color }]}>
          <Text style={[styles.leaveText, { color: lb.color }]}>{lb.label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  segDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  time: {
    color: "#9CA3AF",
    fontSize: 13,
    flex: 1,
  },
  price: {
    color: "#9CA3AF",
    fontSize: 13,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  venue: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 8,
  },
  leaveBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  leaveText: {
    fontSize: 12,
    fontWeight: "600",
  },
});

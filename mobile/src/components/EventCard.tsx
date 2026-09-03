import React, { useRef, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, useWindowDimensions,
} from "react-native";
import type { Event } from "../types";
import {
  formatTime, formatPrice, leaveByResult, contextualLabelResult, getAvailabilityBadge,
} from "./eventCardHelpers";

const SEGMENT_COLORS: Record<string, string> = {
  Music: "#F59E0B",
  Jazz: "#F59E0B",
  Sports: "#3B82F6",
  "Arts & Theatre": "#8B5CF6",
  Comedy: "#8B5CF6",
  Outdoors: "#10B981",
  Family: "#10B981",
  Film: "#EC4899",
  Talks: "#EC4899",
  Nightlife: "#EC4899",
};

const SEGMENT_EMOJI: Record<string, string> = {
  Music: "🎵",
  Jazz: "🎷",
  Sports: "🏆",
  "Arts & Theatre": "🎭",
  Comedy: "🎤",
  Outdoors: "🌳",
  Family: "🌳",
  Film: "🎬",
  Talks: "💬",
  Nightlife: "🌙",
};


interface EventCardProps {
  event: Event;
  onPress: () => void;
  index?: number;
  // False when the feed was loaded without the user's coordinates, so no
  // travel time was ever computed and none should be reported as missing.
  hasOrigin?: boolean;
}

export default function EventCard({ event, onPress, index = 0, hasOrigin = true }: EventCardProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: 300, delay: index * 60, useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0, duration: 300, delay: index * 60, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const now = new Date();
  const isSoldOut = event.availability_tier === "sold_out";
  const dotColor = SEGMENT_COLORS[event.segment ?? ""] ?? "#6B7280";
  const emoji = SEGMENT_EMOJI[event.segment ?? ""] ?? "📍";
  const badge = getAvailabilityBadge(event.availability_tier, event.start_time, now);
  const price = formatPrice(event.price_min, event.price_max, event.is_free);
  const timeStr = formatTime(event.start_time);
  const lb = leaveByResult(event.leave_by, event.availability_tier, now);
  const ctx = contextualLabelResult(event.start_time, event.travel_minutes, now, hasOrigin);

  // Both pill rows pair a flexible label with a sibling that refuses to shrink.
  // At large Dynamic Type sizes the rigid side wins and crushes the label to an
  // ellipsis — "Starts in 25 min" rendered as "St…", which is the most
  // time-sensitive line on the card. Stack them instead of squeezing.
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.35;

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <TouchableOpacity
        style={[styles.card, isSoldOut && styles.soldOut]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        {/* Top section */}
        <View style={styles.top}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <View style={styles.topContent}>
            <Text style={[styles.name, isSoldOut && styles.nameMuted]} numberOfLines={2}>
              {event.name}
            </Text>
            <Text style={[styles.venue, isSoldOut && styles.venueMuted]} numberOfLines={1}>
              {emoji} {event.venue_name ?? "Venue TBD"}
              {event.neighborhood ? ` · ${event.neighborhood}` : ""}
            </Text>
            {event.hook ? (
              <Text style={styles.hook} numberOfLines={2}>
                {`"${event.hook}"`}
              </Text>
            ) : null}
            {/* Source credit, set by the API only where one is owed. Not
                tappable here — the whole card is one tap target, and hijacking
                part of it would cost the user the event they were reaching
                for. The tappable credit lives on the detail screen. */}
            {event.source_name ? (
              <Text style={styles.credit} numberOfLines={1}>
                Listing by {event.source_name}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Bottom 2-row pill */}
        <View style={styles.pill}>
          {/* Row 1 */}
          <View style={[styles.pillRow1, stacked && styles.pillRowStacked]}>
            <View style={styles.priceTime}>
              <Text style={[styles.priceText, event.is_free && styles.priceFree]}>
                {price}
              </Text>
              <Text style={styles.sep}>·</Text>
              <Text style={styles.timeText}>{timeStr}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>
                {badge.label}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Row 2 */}
          <View style={[styles.pillRow2, stacked && styles.pillRowStacked]}>
            <Text
              style={[styles.contextual, stacked && styles.contextualStacked, { color: ctx.color }]}
              numberOfLines={stacked ? 2 : 1}
              ellipsizeMode="tail"
            >
              {ctx.text}
            </Text>
            {lb.text ? (
              <Text style={[styles.leaveBy, { color: lb.color }, lb.bold && styles.leaveBold]}>
                {lb.text}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  soldOut: {
    opacity: 0.7,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  topContent: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    marginBottom: 3,
  },
  nameMuted: {
    color: "#9CA3AF",
  },
  venue: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 5,
  },
  venueMuted: {
    color: "#4B5563",
  },
  credit: {
    color: "#4B5563",
    fontSize: 11,
    marginBottom: 4,
  },
  hook: {
    color: "#9CA3AF",
    fontSize: 13,
    fontStyle: "italic",
  },
  pill: {
    backgroundColor: "#141414",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pillRow1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  priceTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  priceText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  priceFree: {
    color: "#4ade80",
  },
  sep: {
    color: "#374151",
    fontSize: 11,
  },
  timeText: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  badge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#1F2937",
    marginBottom: 6,
  },
  pillRow2: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pillRowStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
  },
  contextualStacked: { flex: 0, marginRight: 0, width: "100%" },
  contextual: {
    flex: 1,
    fontSize: 11,
    marginRight: 8,
  },
  leaveBy: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 0,
  },
  leaveBold: {
    fontWeight: "700",
  },
});

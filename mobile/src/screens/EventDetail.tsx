import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, Linking, Share, StyleSheet, ActivityIndicator } from "react-native";
import type { AppNavProp, AppRouteProp, TravelMode, Event } from "../types";
import { fetchTravel, fetchEvent } from "../api/nowgo";
import { getAvailabilityBadge } from "../components/eventCardHelpers";
import { useAnalytics } from "../services/analytics";
import { walkInNotice } from "../services/walkIn";
import { shareMessage } from "../services/share";

interface Props {
  route: AppRouteProp<"EventDetail">;
  navigation: AppNavProp<"EventDetail">;
}

// Walk-ins that can be relied on read green; conditional ones amber; a venue
// that requires a ticket is stated plainly rather than warned about.
const WALK_IN_TONE = {
  good:  { borderColor: "#166534", backgroundColor: "#0B2015" },
  mixed: { borderColor: "#854D0E", backgroundColor: "#231A08" },
  plain: { borderColor: "#2A2A2A", backgroundColor: "#161616" },
} as const;

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

const MAPS_DIR_FLAG: Record<TravelMode, string> = {
  transit: "r",
  walk: "w",
  drive: "d",
};

function openMapsDirections(
  venueLat: number | null | undefined,
  venueLng: number | null | undefined,
  venueAddress: string | null | undefined,
  mode: TravelMode
) {
  const flag = MAPS_DIR_FLAG[mode];
  if (venueLat != null && venueLng != null) {
    Linking.openURL(`maps://maps.apple.com/?daddr=${venueLat},${venueLng}&dirflg=${flag}`);
  } else if (venueAddress) {
    const encoded = encodeURIComponent(venueAddress);
    Linking.openURL(`maps://maps.apple.com/?daddr=${encoded}&dirflg=${flag}`);
  }
}

export default function EventDetail({ route, navigation }: Props) {
  const { event, userLat, userLng, initialMode = "transit" } = route.params;

  const hasGeo = userLat != null && userLng != null
    && event.venue_lat != null && event.venue_lng != null;

  const [mode, setMode] = useState<TravelMode>(initialMode);
  const [travelMinutes, setTravelMinutes] = useState<number | null>(event.travel_minutes ?? null);
  const [distanceKm, setDistanceKm] = useState<number | null>(event.travel_distance_km ?? null);
  const [leaveBy, setLeaveBy] = useState<string | null | undefined>(event.leave_by);
  const [travelSource, setTravelSource] = useState<string | null>(event.travel_source ?? null);
  const [travelLoading, setTravelLoading] = useState(false);
  const [alternatives, setAlternatives] = useState<Event[]>(event.alternatives ?? []);
  const analytics = useAnalytics();

  const isSoldOut = event.availability_tier === "sold_out";

  // The feed hands this screen its own event object, which carries no
  // alternatives — only GET /events/:id computes them. So fetch them here, and
  // only when they would actually be shown.
  useEffect(() => {
    if (!isSoldOut || (event.alternatives?.length ?? 0) > 0) return;
    let cancelled = false;
    fetchEvent(event.event_id)
      .then((full) => {
        if (!cancelled) setAlternatives(full.alternatives ?? []);
      })
      .catch((err) => {
        // A failed suggestion lookup must not disturb the event itself.
        analytics.captureError(err instanceof Error ? err : new Error(String(err)), {
          event_id: event.event_id,
          stage: "alternatives",
        });
      });
    return () => { cancelled = true; };
  }, [event.event_id, isSoldOut]);

  async function switchMode(newMode: TravelMode) {
    if (newMode === mode || !hasGeo) return;
    setMode(newMode);
    setTravelLoading(true);
    analytics.travelModeChanged(event.event_id, newMode);
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
    } catch (err) {
      analytics.captureError(err instanceof Error ? err : new Error(String(err)));
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

      {/* What the venue actually said about turning up without a ticket.
          Driven by the curated venue policy, never by the absence of a ticket
          URL: a missing link says nothing about whether the door is open. An
          uncurated venue renders nothing rather than guessing either way. */}
      {(() => {
        const notice = walkInNotice(event.walk_in_policy, event.door_price);
        if (!notice || isSoldOut) return null;
        return (
          <View style={[styles.walkInCard, WALK_IN_TONE[notice.tone]]}>
            <Text style={styles.walkInTitle}>{notice.title}</Text>
            {notice.detail ? (
              <Text style={styles.walkInDetail}>{notice.detail}</Text>
            ) : null}
          </View>
        );
      })()}

      {/* CTA row */}
      <View style={styles.ctaRow}>
        {/* Primary: tickets or walk-in note.
            A sold-out event gets neither — sending someone to a ticket page
            for a show with no tickets is the dead end this screen exists to
            replace. Directions still show: people do turn up for returns. */}
        {isSoldOut ? (
          <View style={styles.soldOutNote}>
            <Text style={styles.soldOutNoteText}>Sold out · no tickets available</Text>
          </View>
        ) : event.url ? (
          <TouchableOpacity
            style={styles.ticketsBtn}
            onPress={() => { analytics.ticketsTapped(event.event_id, event.name); Linking.openURL(event.url!); }}
          >
            <Text style={styles.ticketsBtnText}>Get Tickets →</Text>
          </TouchableOpacity>
        ) : null}

        {/* Secondary: directions — shows if event has an address or coords */}
        {(event.venue_lat != null || event.venue_address != null) && (
          <TouchableOpacity
            style={styles.directionsBtn}
            onPress={() => { analytics.directionsTapped(event.event_id, mode); openMapsDirections(event.venue_lat, event.venue_lng, event.venue_address, mode); }}
          >
            <Text style={styles.directionsBtnText}>📍 Directions</Text>
          </TouchableOpacity>
        )}

        {/* Share. The leave-by time is computed at tap, not at render, because
            the clock keeps running while this screen is open and a stale
            "leave by" is worse than none. Analytics fires on tap rather than
            on completion — iOS does not reliably report which app was chosen,
            and a cancelled share still says the event was worth sending. */}
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={async () => {
            analytics.eventShared(event.event_id, event.availability_tier);
            try {
              await Share.share({ message: shareMessage(event, leaveBy) });
            } catch {
              // A failed or dismissed share sheet is not worth interrupting
              // anyone over — there is nothing for the user to fix.
            }
          }}
        >
          <Text style={styles.shareBtnText}>↗ Share</Text>
        </TouchableOpacity>
      </View>

      {/* Alternatives — only for a sold-out event, and only if we found any. */}
      {isSoldOut && alternatives.length > 0 ? (
        <View style={styles.altSection}>
          <Text style={styles.altHeading}>
            Still open{event.neighborhood ? ` near ${event.neighborhood}` : " nearby"}
          </Text>
          {alternatives.map((alt) => (
            <TouchableOpacity
              key={alt.event_id}
              style={styles.altRow}
              activeOpacity={0.7}
              onPress={() => {
                analytics.alternativeTapped(event.event_id, alt.event_id);
                navigation.push("EventDetail", {
                  event: alt,
                  userLat,
                  userLng,
                  initialMode: mode,
                });
              }}
            >
              <View style={styles.altMain}>
                <Text style={styles.altName} numberOfLines={1}>{alt.name}</Text>
                <Text style={styles.altMeta} numberOfLines={1}>
                  {alt.venue_name ?? "Venue TBD"}
                  {alt.neighborhood ? ` · ${alt.neighborhood}` : ""}
                </Text>
              </View>
              <View style={styles.altRight}>
                <Text style={styles.altTime}>
                  {new Date(alt.start_time).toLocaleTimeString("en-US", {
                    hour: "numeric", minute: "2-digit", hour12: true,
                    timeZone: "America/New_York",
                  })}
                </Text>
                {alt.walk_in ? <Text style={styles.altWalkIn}>🚶 Walk-in</Text> : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Source credit. Only rendered when the API says a credit is owed —
          Ticketmaster and SeatGeek events link to their own pages, so the
          "Get Tickets" button is already their attribution. jazz-nyc events
          carry the venue's website instead, which means without this line
          nothing on the screen says where the listing came from, and no tap
          ever reaches them. */}
      {event.source_name && event.source_url ? (
        <TouchableOpacity
          style={styles.creditRow}
          activeOpacity={0.7}
          onPress={() => {
            analytics.sourceCreditTapped(event.source ?? "unknown", event.event_id);
            Linking.openURL(event.source_url!);
          }}
        >
          <Text style={styles.creditText}>
            Listing by <Text style={styles.creditLink}>{event.source_name}</Text>
          </Text>
        </TouchableOpacity>
      ) : null}
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

  ctaRow: {
    gap: 10,
  },
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
  walkInCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  walkInTitle: { color: "#E5E7EB", fontSize: 15, fontWeight: "600" },
  walkInDetail: { color: "#9CA3AF", fontSize: 13, marginTop: 3 },
  walkInNote: {
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#1A1A1A",
  },
  walkInText: {
    color: "#93c5fd",
    fontSize: 15,
    fontWeight: "600",
  },
  creditRow: {
    marginTop: 28,
    marginBottom: 8,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  creditText: {
    fontSize: 12,
    color: "#6B7280",
  },
  creditLink: {
    color: "#9CA3AF",
    textDecorationLine: "underline",
  },
  soldOutNote: {
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#141414",
  },
  soldOutNoteText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "600",
  },
  altSection: {
    marginTop: 26,
  },
  altHeading: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  altRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
  },
  altMain: {
    flex: 1,
    minWidth: 0,
  },
  altName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  altMeta: {
    color: "#6B7280",
    fontSize: 12,
  },
  altRight: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  altTime: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "600",
  },
  altWalkIn: {
    color: "#93c5fd",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  shareBtn: {
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#1A1A1A",
  },
  shareBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  directionsBtn: {
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#1A1A1A",
  },
  directionsBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});

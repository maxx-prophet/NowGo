import { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, RefreshControl, Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import EventCard from "../components/EventCard";
import FilterSheet from "../components/FilterSheet";
import SurpriseSheet from "../components/SurpriseSheet";
import { fetchTonightEvents } from "../api/nowgo";
import type { Event, AppNavProp } from "../types";
import { useAnalytics } from "../services/analytics";
import { useLocation } from "../hooks/useLocation";
import { emptyReason } from "../services/coverage";
import {
  ALL_CATEGORIES,
  NO_BUDGET,
  toggleCategory,
  toggleBudget,
  isFiltered as computeIsFiltered,
  type BudgetMax,
} from "../services/filters";

const CATEGORIES = [
  "All", "Jazz", "Music", "Comedy", "Theatre",
  "Sports", "Art", "Outdoors", "Film", "Talks", "Nightlife", "Family",
];

// "Any" leads, the way "All" leads the categories — it is the way out of a
// price filter, and at the end of the row it sat off-screen behind the
// transport dropdown where nobody could find it.
const BUDGETS: { label: string; value: BudgetMax }[] = [
  { label: "Any", value: NO_BUDGET },
  { label: "Free", value: 0 },
  { label: "<$25", value: 25 },
  { label: "<$50", value: 50 },
  { label: "<$100", value: 100 },
];

const MODES = [
  { key: "transit" as const, emoji: "🚇", label: "Transit" },
  { key: "walk" as const,    emoji: "🚶", label: "Walk" },
  { key: "drive" as const,   emoji: "🚗", label: "Drive" },
];
const MODE_EMOJI: Record<string, string> = { transit: "🚇", walk: "🚶", drive: "🚗" };

interface Props {
  navigation: AppNavProp<"TonightFeed">;
}

export default function TonightFeed({ navigation }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [soldOutEvents, setSoldOutEvents] = useState<Event[]>([]);
  const [soldOutExpanded, setSoldOutExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { coords, permissionStatus } = useLocation();

  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [budgetMax, setBudgetMax] = useState<BudgetMax>(NO_BUDGET);
  const [mode, setMode] = useState<"transit" | "walk" | "drive">("transit");
  const [sortBy, setSortBy] = useState<"best" | "soonest" | "nearest" | "cheapest">("best");
  const [walkInsOnly, setWalkInsOnly] = useState(false);

  // Set once a located search comes back empty while events exist elsewhere:
  // the user is outside the NYC coverage area. `ignoreLocation` is their way
  // out — it re-runs the search with no coordinates, which the API treats as
  // "everywhere" and so returns the NYC feed.
  const [nationwideCount, setNationwideCount] = useState<number | null>(null);
  const [ignoreLocation, setIgnoreLocation] = useState(false);

  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const analytics = useAnalytics();

  const [surpriseEvents, setSurpriseEvents] = useState<Event[]>([]);
  const [surpriseOpen, setSurpriseOpen] = useState(false);
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  // Which Surprise Me pick is on screen. Owned here rather than in the sheet
  // so a dismissal can report the pick the user gave up on.
  const [surpriseIndex, setSurpriseIndex] = useState(0);

  const isFiltered = computeIsFiltered({ category, budgetMax, walkInsOnly });
  // Whether this feed was loaded from a real position, which is what decides
  // if a missing travel time is a gap or simply not applicable.
  const hasOrigin = !!coords && !ignoreLocation;

  const load = useCallback(async (isRefresh = false) => {
    // Dropping the coordinates is what "Browse NYC anyway" does — the API
    // treats an unlocated request as unbounded and returns the whole feed.
    const searchCoords = ignoreLocation ? undefined : coords;
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setEvents([]); // clear stale results so empty state shows during filter change
        setSoldOutEvents([]);
      }
      // Collapse on every load: a filter change makes the previous sold-out
      // list stale, and leaving it open would show events that no longer match.
      setSoldOutExpanded(false);
      setError(null);
      setNationwideCount(null);
      const data = await fetchTonightEvents({
        lat: searchCoords?.latitude,
        lng: searchCoords?.longitude,
        mode,
        segment: category,
        budgetMax,
        sortBy,
        walkInsOnly,
      });
      const loaded = data.events ?? [];
      const soldOut = data.sold_out_events ?? [];
      setEvents(loaded);
      setSoldOutEvents(soldOut);
      analytics.feedLoaded(loaded.length, category);
      if (soldOut.length > 0) analytics.soldOutShown(soldOut.length, loaded.length);

      // An empty located search has two very different causes — the user is
      // outside NYC, or the night really is over. Repeating the search without
      // the radius is the only thing that separates them, so it runs only in
      // the one case that is ambiguous.
      if (loaded.length === 0 && soldOut.length === 0 && searchCoords && !isFiltered) {
        try {
          const everywhere = await fetchTonightEvents({ mode, sortBy });
          const count = (everywhere.events ?? []).length;
          setNationwideCount(count);
          if (count > 0) analytics.outsideCoverageShown(count);
        } catch {
          // Best effort. A failed probe leaves nationwideCount null, which
          // resolves to the ordinary empty message rather than a guess.
          setNationwideCount(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      analytics.captureError(err instanceof Error ? err : new Error(String(err)), { segment: category });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [coords, category, mode, budgetMax, sortBy, walkInsOnly, ignoreLocation, isFiltered]);

  function clearFilters() {
    setCategory(ALL_CATEGORIES);
    setBudgetMax(NO_BUDGET);
    setWalkInsOnly(false);
    setSortBy("best");
  }

  async function loadSurprise() {
    setSurpriseLoading(true);
    setSurpriseOpen(true);
    setSurpriseIndex(0);
    try {
      // Same rule as the feed: once the user has chosen to browse NYC from
      // elsewhere, Surprise Me must not quietly re-apply the radius and hand
      // back an empty sheet.
      const surpriseCoords = ignoreLocation ? undefined : coords;
      const data = await fetchTonightEvents({
        lat: surpriseCoords?.latitude,
        lng: surpriseCoords?.longitude,
        mode,
        surpriseMe: true,
      });
      setSurpriseEvents(data.events ?? []);
    } catch {
      setSurpriseEvents([]);
    } finally {
      setSurpriseLoading(false);
    }
  }

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.container}>
      {/* Row 1 — Category pills */}
      <View style={styles.categoryRowWrap}>
        <FlatList
          data={CATEGORIES}
          horizontal
          keyExtractor={(s) => s}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.chip, category === item && styles.chipActive]}
              onPress={() => {
                const next = toggleCategory(category, item);
                setCategory(next);
                analytics.categorySelected(next);
              }}
            >
              <Text style={[styles.chipText, category === item && styles.chipTextActive]}>
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
        <LinearGradient
          colors={["transparent", "#0A0A0A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.fadeRight}
          pointerEvents="none"
        />
        <View pointerEvents="none" style={styles.scrollArrow}>
          <Text style={styles.scrollArrowText}>›</Text>
        </View>
      </View>

      {/* Row 2 — Budget chips + pinned buttons */}
      <View style={styles.budgetRow}>
        {/* Left: scrollable budget chips */}
        <View style={styles.budgetScrollWrap}>
          <FlatList
            data={BUDGETS}
            horizontal
            keyExtractor={(b) => b.label}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.budgetChipRow}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.budgetChip, budgetMax === item.value && styles.budgetChipActive]}
                onPress={() => {
                  const next = toggleBudget(budgetMax, item.value);
                  setBudgetMax(next);
                  analytics.budgetFilterApplied(next ?? null);
                }}
              >
                <Text style={[styles.budgetChipText, budgetMax === item.value && styles.budgetChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
          <LinearGradient
            colors={["transparent", "#0A0A0A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.budgetFadeRight}
            pointerEvents="none"
          />
        </View>

        {/* Right: pinned mode + filter buttons */}
        <View style={styles.pinnedButtons}>
          {/* Mode button + inline picker */}
          <View>
            <TouchableOpacity
              style={styles.modeButton}
              onPress={() => setModePickerOpen((v) => !v)}
            >
              <Text style={styles.modeButtonText}>{MODE_EMOJI[mode]} ▾</Text>
            </TouchableOpacity>
            {modePickerOpen && (
              <View style={styles.modePicker}>
                {MODES.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={styles.modePickerItem}
                    onPress={() => { setMode(m.key); setModePickerOpen(false); }}
                  >
                    <Text style={styles.modePickerText}>{m.emoji} {m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Filter button */}
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => { setFilterSheetOpen(true); analytics.filterSheetOpened(); }}
          >
            <View style={styles.filterIconWrap}>
              <View style={[styles.filterLine, { width: 14 }]} />
              <View style={[styles.filterLine, { width: 10 }]} />
              <View style={[styles.filterLine, { width: 6 }]} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Surprise Me button */}
      <TouchableOpacity style={styles.surpriseBtn} onPress={() => { loadSurprise(); analytics.surpriseMeTapped(); }}>
        <Text style={styles.surpriseBtnText}>🎲  Surprise Me</Text>
      </TouchableOpacity>

      {/* Location permission nudge — shown only when denied */}
      {permissionStatus === "denied" && (
        <TouchableOpacity
          style={styles.locationNudge}
          onPress={() => Linking.openURL("app-settings:")}
        >
          <Text style={styles.locationNudgeText}>
            📍 Enable location for nearby events
          </Text>
        </TouchableOpacity>
      )}

      {/* Events list */}
      <FlatList
        data={events}
        keyExtractor={(e) => e.event_id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#FF6B35" />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <ActivityIndicator color="#FF6B35" size="large" />
            ) : error ? (
              <>
                <Text style={styles.errorText}>⚠️ {error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </>
            ) : (
              (() => {
                const reason = emptyReason({
                  isFiltered,
                  usedLocation: !ignoreLocation && !!coords,
                  nationwideCount,
                });

                // Being outside the coverage area is not the same as the night
                // being over, and saying "No events tonight" to someone in
                // another city reads as a dead app rather than a limited one.
                if (reason === "outside-coverage") {
                  return (
                    <>
                      <Text style={styles.emptyTitle}>NowGo is NYC-only for now</Text>
                      <Text style={styles.emptyText}>
                        You're outside the area we cover, so there's nothing on near you tonight.
                      </Text>
                      <TouchableOpacity
                        style={styles.clearBtn}
                        onPress={() => {
                          analytics.browsedNycAnyway();
                          setIgnoreLocation(true);
                        }}
                      >
                        <Text style={styles.clearBtnText}>Browse NYC anyway</Text>
                      </TouchableOpacity>
                    </>
                  );
                }

                return (
                  <>
                    <Text style={styles.emptyText}>
                      {reason === "filtered" ? "No events match your filters" : "No events tonight"}
                    </Text>
                    {reason === "filtered" && (
                      <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
                        <Text style={styles.clearBtnText}>Clear filters</Text>
                      </TouchableOpacity>
                    )}
                  </>
                );
              })()
            )}
          </View>
        }
        ListFooterComponent={
          soldOutEvents.length > 0 ? (
            <View style={styles.soldOutSection}>
              <TouchableOpacity
                style={styles.soldOutToggle}
                onPress={() => {
                  const next = !soldOutExpanded;
                  setSoldOutExpanded(next);
                  if (next) analytics.soldOutRevealed(soldOutEvents.length);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.soldOutRule} />
                <Text style={styles.soldOutToggleText}>
                  {soldOutExpanded
                    ? "Hide sold-out"
                    : `Show ${soldOutEvents.length} sold-out nearby`}
                </Text>
                <View style={styles.soldOutRule} />
              </TouchableOpacity>

              {soldOutExpanded
                ? soldOutEvents.map((item, i) => (
                    <EventCard
                      key={item.event_id}
                      event={item}
                      index={i}
                      hasOrigin={hasOrigin}
                      onPress={() => {
                        analytics.eventTapped(item.event_id, item.name, item.segment);
                        navigation.navigate("EventDetail", {
                          event: item,
                          userLat: coords?.latitude ?? null,
                          userLng: coords?.longitude ?? null,
                          initialMode: mode,
                        });
                      }}
                    />
                  ))
                : null}
            </View>
          ) : null
        }
        ListHeaderComponent={
          events.length > 0 ? (
            <Text
              style={styles.countLabel}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {events.length} events
              {coords && !ignoreLocation ? " · near you" : " · NYC"}
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => (
          <EventCard
            event={item}
            index={index}
            hasOrigin={hasOrigin}
            onPress={() => {
              analytics.eventTapped(item.event_id, item.name, item.segment);
              navigation.navigate("EventDetail", {
                event: item,
                userLat: coords?.latitude ?? null,
                userLng: coords?.longitude ?? null,
                initialMode: mode,
              });
            }}
          />
        )}
        contentContainerStyle={styles.listContent}
      />
      {/* Mode picker backdrop — dismiss on outside tap */}
      {modePickerOpen && (
        <TouchableOpacity
          style={styles.modePickerBackdrop}
          activeOpacity={0}
          onPress={() => setModePickerOpen(false)}
        />
      )}

      <FilterSheet
        visible={filterSheetOpen}
        sortBy={sortBy}
        walkInsOnly={walkInsOnly}
        onApply={(newSort, newWalkIns) => {
          setSortBy(newSort);
          setWalkInsOnly(newWalkIns);
        }}
        onClose={() => setFilterSheetOpen(false)}
      />

      <SurpriseSheet
        visible={surpriseOpen}
        events={surpriseEvents}
        loading={surpriseLoading}
        surpriseIndex={surpriseIndex}
        onClose={() => {
          // Dismissed without taking a pick. Only counts as a verdict when
          // there was something to reject — closing a still-loading or empty
          // sheet says nothing about recommendation quality.
          if (surpriseEvents.length > 0) {
            analytics.surpriseMeDismissed(surpriseIndex, surpriseEvents.length);
          }
          setSurpriseOpen(false);
        }}
        onSkip={(index) => {
          analytics.surpriseMeSkipped(index);
          setSurpriseIndex(index + 1);
        }}
        onAccept={(event, index) => {
          analytics.surpriseMeAccepted(event.event_id, index);
          setSurpriseOpen(false);
          navigation.navigate("EventDetail", {
            event,
            userLat: coords?.latitude ?? null,
            userLng: coords?.longitude ?? null,
            initialMode: mode,
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  categoryRowWrap: { position: "relative" },
  fadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },
  scrollArrow: {
    position: "absolute",
    right: 6,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  scrollArrowText: {
    color: "#6B7280",
    fontSize: 18,
  },
  chipRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  chipActive: { backgroundColor: "#FF6B35", borderColor: "#FF6B35" },
  chipText: { color: "#9CA3AF", fontSize: 13, fontWeight: "500" },
  chipTextActive: { color: "#FFFFFF", fontWeight: "700" },
  budgetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 8,
    zIndex: 10,
  },
  budgetScrollWrap: { flex: 1, position: "relative" },
  budgetChipRow: { paddingHorizontal: 16, paddingTop: 8, gap: 8, alignItems: "center" },
  budgetChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  budgetChipActive: { backgroundColor: "#F5A623", borderColor: "#F5A623" },
  budgetChipText: { color: "#9CA3AF", fontSize: 13, fontWeight: "500" },
  budgetChipTextActive: { color: "#111111", fontWeight: "700" },
  budgetFadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 32,
  },
  pinnedButtons: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
    gap: 8,
  },
  modeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  modeButtonText: { color: "#FFFFFF", fontSize: 13 },
  modePicker: {
    position: "absolute",
    top: 36,
    right: 0,
    backgroundColor: "#1C1C1C",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    zIndex: 100,
    elevation: 10,
    minWidth: 110,
    overflow: "hidden",
  },
  modePickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modePickerText: { color: "#FFFFFF", fontSize: 14 },
  filterButton: {
    padding: 8,
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    justifyContent: "center",
    alignItems: "center",
  },
  filterIconWrap: { gap: 3, alignItems: "flex-start" },
  filterLine: { height: 1.5, backgroundColor: "#9CA3AF", borderRadius: 1 },
  modePickerBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9,
  },
  countLabel: {
    color: "#4B5563",
    fontSize: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    marginTop: 4,
  },
  listContent: { paddingBottom: 32 },
  soldOutSection: {
    marginTop: 18,
  },
  soldOutToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 6,
  },
  soldOutRule: {
    flex: 1,
    height: 1,
    backgroundColor: "#1F2937",
  },
  soldOutToggleText: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 0,
  },
  errorText: { color: "#EF4444", fontSize: 15, marginBottom: 16, textAlign: "center", paddingHorizontal: 32 },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
  },
  retryText: { color: "#FF6B35", fontWeight: "600" },
  emptyState: {
    paddingTop: 80,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: { color: "#E5E7EB", fontSize: 17, fontWeight: "600", textAlign: "center", marginBottom: 6 },
  emptyText: { color: "#4B5563", fontSize: 15, textAlign: "center" },
  clearBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  clearBtnText: { color: "#FF6B35", fontWeight: "600", fontSize: 14 },
  surpriseBtn: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#FF6B35",
    alignItems: "center",
  },
  surpriseBtnText: {
    color: "#FF6B35",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  locationNudge: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    flexDirection: "row",
    alignItems: "center",
  },
  locationNudgeText: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "500",
  },
});

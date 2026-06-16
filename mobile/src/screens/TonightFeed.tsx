import { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, RefreshControl, Modal, Switch,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import EventCard from "../components/EventCard";
import { fetchTonightEvents } from "../api/nowgo";
import type { Event } from "../types";

const CATEGORIES = [
  "All", "Jazz", "Music", "Comedy", "Theater",
  "Sports", "Art", "Outdoors", "Film", "Talks", "Nightlife", "Family",
];

const BUDGETS: { label: string; value: number | null }[] = [
  { label: "Free", value: 0 },
  { label: "<$25", value: 25 },
  { label: "<$50", value: 50 },
  { label: "<$100", value: 100 },
  { label: "Any", value: null },
];

const MODES = [
  { key: "transit" as const, emoji: "🚇", label: "Transit" },
  { key: "walk" as const,    emoji: "🚶", label: "Walk" },
  { key: "drive" as const,   emoji: "🚗", label: "Drive" },
];
const MODE_EMOJI: Record<string, string> = { transit: "🚇", walk: "🚶", drive: "🚗" };

const SORT_OPTIONS = [
  { key: "best" as const,     label: "Best Match" },
  { key: "soonest" as const,  label: "Soonest" },
  { key: "nearest" as const,  label: "Nearest" },
  { key: "cheapest" as const, label: "Cheapest" },
];

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

export default function TonightFeed({ navigation }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);

  const [category, setCategory] = useState("All");
  const [budgetMax, setBudgetMax] = useState<number | null>(null);
  const [mode, setMode] = useState<"transit" | "walk" | "drive">("transit");
  const [sortBy, setSortBy] = useState<"best" | "soonest" | "nearest" | "cheapest">("best");
  const [walkInsOnly, setWalkInsOnly] = useState(false);

  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation(loc.coords);
      }
    })();
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      const data = await fetchTonightEvents({
        lat: location?.latitude,
        lng: location?.longitude,
        mode,
        segment: category,
        budgetMax,
        sortBy,
        walkInsOnly,
      });
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [location, category, mode, budgetMax, sortBy, walkInsOnly]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#FF6B35" size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>⚠️ {error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
              onPress={() => setCategory(item)}
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
        <Text style={styles.scrollArrow} pointerEvents="none">›</Text>
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
                onPress={() => setBudgetMax(item.value)}
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
            onPress={() => setFilterSheetOpen(true)}
          >
            <View style={styles.filterIconWrap}>
              <View style={[styles.filterLine, { width: 14 }]} />
              <View style={[styles.filterLine, { width: 10 }]} />
              <View style={[styles.filterLine, { width: 6 }]} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Events list */}
      <FlatList
        data={events}
        keyExtractor={(e) => e.event_id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#FF6B35" />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No events found tonight</Text>
          </View>
        }
        ListHeaderComponent={
          <Text style={styles.countLabel}>
            {events.length} events tonight
            {location ? " · near you" : " · NYC"}
          </Text>
        }
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={() => navigation.navigate("EventDetail", { event: item })}
          />
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0A0A0A" },
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
    top: "50%",
    color: "#6B7280",
    fontSize: 18,
    marginTop: -10,
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
  },
  budgetScrollWrap: { flex: 1, position: "relative" },
  budgetChipRow: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
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
  countLabel: {
    color: "#4B5563",
    fontSize: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    marginTop: 4,
  },
  listContent: { paddingBottom: 32 },
  errorText: { color: "#EF4444", fontSize: 15, marginBottom: 16, textAlign: "center", paddingHorizontal: 32 },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
  },
  retryText: { color: "#FF6B35", fontWeight: "600" },
  emptyText: { color: "#4B5563", fontSize: 15 },
});

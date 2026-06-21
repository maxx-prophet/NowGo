import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect } from "react";
import type { UserPreferences } from "../types";

const STORAGE_KEY = "@nowgo/preferences";

const DEFAULT_PREFERENCES: UserPreferences = {
  identity: "local",
  vibes: [],
  budgetMax: 50,
  onboardingComplete: false,
};

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(raw) });
      setLoading(false);
    });
  }, []);

  async function savePreferences(updates: Partial<UserPreferences>) {
    const next = { ...preferences, ...updates };
    setPreferences(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function completeOnboarding(final: Omit<UserPreferences, "onboardingComplete">) {
    const next: UserPreferences = { ...final, onboardingComplete: true };
    setPreferences(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function resetOnboarding() {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setPreferences(DEFAULT_PREFERENCES);
  }

  return { preferences, loading, savePreferences, completeOnboarding, resetOnboarding };
}

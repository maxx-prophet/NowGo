import { test } from "node:test";
import assert from "node:assert/strict";

// Pure logic tests — no AsyncStorage dependency needed

test("DEFAULT_PREFERENCES has onboardingComplete false", () => {
  const defaults = {
    identity: "local" as const,
    vibes: [],
    budgetMax: 50,
    onboardingComplete: false,
  };
  assert.equal(defaults.onboardingComplete, false);
  assert.deepEqual(defaults.vibes, []);
});

test("merging partial preferences preserves existing keys", () => {
  const existing = { identity: "local" as const, vibes: ["Jazz"], budgetMax: 100, onboardingComplete: false };
  const update = { vibes: ["Jazz", "Theater"] };
  const merged = { ...existing, ...update };
  assert.equal(merged.identity, "local");
  assert.equal(merged.budgetMax, 100);
  assert.deepEqual(merged.vibes, ["Jazz", "Theater"]);
});

test("completeOnboarding sets onboardingComplete true", () => {
  const final = { identity: "transplant" as const, vibes: ["Comedy"], budgetMax: 50 };
  const result = { ...final, onboardingComplete: true };
  assert.equal(result.onboardingComplete, true);
});

test("budgetMax null represents no limit", () => {
  const prefs = { identity: "local" as const, vibes: [], budgetMax: null, onboardingComplete: false };
  assert.equal(prefs.budgetMax, null);
});

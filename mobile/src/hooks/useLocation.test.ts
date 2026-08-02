import { test } from "node:test";
import assert from "node:assert/strict";

// Duplicated from useLocation.ts (not imported) — importing the hook pulls in
// expo-location, whose package resolves to raw .ts under node_modules that
// Node's native type-stripping refuses to touch.
function normalizePermissionStatus(
  status: string
): "granted" | "denied" | "undetermined" {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

test("granted maps to granted", () => {
  assert.equal(normalizePermissionStatus("granted"), "granted");
});

test("denied maps to denied", () => {
  assert.equal(normalizePermissionStatus("denied"), "denied");
});

test("restricted maps to undetermined", () => {
  assert.equal(normalizePermissionStatus("restricted"), "undetermined");
});

test("unknown string maps to undetermined", () => {
  assert.equal(normalizePermissionStatus("anything-else"), "undetermined");
});

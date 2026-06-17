import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPrice,
  leaveByResult,
  contextualLabelResult,
} from "./eventCardHelpers.ts";

// formatPrice
test("formatPrice: free event returns FREE", () => {
  assert.equal(formatPrice(null, null, true), "FREE");
});

test("formatPrice: no price data returns dash", () => {
  assert.equal(formatPrice(null, null, false), "—");
});

test("formatPrice: single price", () => {
  assert.equal(formatPrice(35, 35, false), "$35");
});

test("formatPrice: price range", () => {
  assert.equal(formatPrice(20, 50, false), "$20–$50");
});

// leaveByResult
test("leaveByResult: sold_out ignores leave_by", () => {
  const now = new Date("2026-06-16T20:00:00Z");
  const future = "2026-06-16T21:00:00Z";
  const result = leaveByResult(future, "sold_out", now);
  assert.equal(result.text, "No travel needed");
  assert.equal(result.bold, false);
});

test("leaveByResult: null leave_by returns empty text", () => {
  const now = new Date("2026-06-16T20:00:00Z");
  const result = leaveByResult(null, "available", now);
  assert.equal(result.text, "");
});

test("leaveByResult: leave_by more than 5min past returns Underway", () => {
  const now = new Date("2026-06-16T20:10:00Z");
  const leaveBy = "2026-06-16T20:00:00Z"; // 10 min ago
  const result = leaveByResult(leaveBy, "available", now);
  assert.equal(result.text, "Underway");
});

test("leaveByResult: leave_by just passed returns Leave NOW", () => {
  const now = new Date("2026-06-16T20:02:00Z");
  const leaveBy = "2026-06-16T20:00:00Z"; // 2 min ago
  const result = leaveByResult(leaveBy, "available", now);
  assert.equal(result.text, "⚡ Leave NOW");
  assert.equal(result.bold, true);
  assert.equal(result.color, "#EF4444");
});

test("leaveByResult: leave_by within 30min shows Leave in Xm", () => {
  const now = new Date("2026-06-16T20:00:00Z");
  const leaveBy = "2026-06-16T20:15:00Z"; // 15 min from now
  const result = leaveByResult(leaveBy, "available", now);
  assert.equal(result.text, "Leave in 15m");
});

test("leaveByResult: leave_by over 30min shows Leave by time", () => {
  const now = new Date("2026-06-16T20:00:00Z");
  const leaveBy = "2026-06-16T20:45:00Z"; // 45 min from now
  const result = leaveByResult(leaveBy, "available", now);
  assert.ok(result.text.startsWith("Leave by"));
  assert.equal(result.color, "#22C55E");
});

// contextualLabelResult
test("contextualLabelResult: null travelMinutes returns Time unknown", () => {
  const now = new Date("2026-06-16T20:00:00Z");
  const result = contextualLabelResult("2026-06-16T21:00:00Z", null, now);
  assert.equal(result.text, "Time unknown");
});

test("contextualLabelResult: event started <2hrs ago shows Started X min ago", () => {
  const now = new Date("2026-06-16T20:30:00Z");
  const startTime = "2026-06-16T20:00:00Z"; // started 30 min ago
  const result = contextualLabelResult(startTime, 10, now);
  assert.ok(result.text.startsWith("Started 30 min ago"));
});

test("contextualLabelResult: event started >2hrs ago returns Underway", () => {
  const now = new Date("2026-06-16T23:00:00Z");
  const startTime = "2026-06-16T20:00:00Z"; // 3 hrs ago
  const result = contextualLabelResult(startTime, 10, now);
  assert.equal(result.text, "Underway");
});

test("contextualLabelResult: starts in <60min shows Starts in X min", () => {
  const now = new Date("2026-06-16T19:30:00Z");
  const startTime = "2026-06-16T20:00:00Z"; // 30 min away
  const result = contextualLabelResult(startTime, 10, now);
  assert.equal(result.text, "Starts in 30 min");
});

test("contextualLabelResult: starts in >60min shows Starts in Xh Ym", () => {
  const now = new Date("2026-06-16T18:00:00Z");
  const startTime = "2026-06-16T20:00:00Z"; // 2hrs away
  const result = contextualLabelResult(startTime, 10, now);
  assert.equal(result.text, "Starts in 2h 0m");
});

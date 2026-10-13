import { test } from "node:test";
import assert from "node:assert";
import { shouldOpenOnTomorrow, autoSwitchNotice } from "./night.ts";

// EDT: ET = UTC−4.
const at = (utc: string) => new Date(utc);

test("opens on tomorrow late at night when fewer than 5 remain", () => {
  assert.equal(shouldOpenOnTomorrow(at("2026-09-02T02:00:00Z"), 4), true); // 10pm
  assert.equal(shouldOpenOnTomorrow(at("2026-09-02T05:00:00Z"), 0), true); // 1am
  assert.equal(shouldOpenOnTomorrow(at("2026-09-02T07:59:00Z"), 2), true); // 3:59am
});

test("does not switch when tonight still has 5 or more", () => {
  assert.equal(shouldOpenOnTomorrow(at("2026-09-02T03:00:00Z"), 5), false); // 11pm
});

test("does not switch before 10pm or from 4am, however empty tonight is", () => {
  assert.equal(shouldOpenOnTomorrow(at("2026-09-02T01:59:00Z"), 0), false); // 9:59pm
  assert.equal(shouldOpenOnTomorrow(at("2026-09-02T08:00:00Z"), 0), false); // 4:00am
  assert.equal(shouldOpenOnTomorrow(at("2026-09-01T18:00:00Z"), 0), false); // 2pm
});

test("uses NYC time, not the device's zone", () => {
  // 21:30Z is 5:30pm in NYC but 10:30pm in London. A phone set to London
  // time must not switch.
  assert.equal(shouldOpenOnTomorrow(at("2026-09-01T21:30:00Z"), 0), false);
});

test("the notice counts what is left tonight", () => {
  assert.equal(autoSwitchNotice(3), "Only 3 things left tonight. Showing tomorrow night.");
  assert.equal(autoSwitchNotice(1), "Only 1 thing left tonight. Showing tomorrow night.");
  assert.equal(autoSwitchNotice(0), "Nothing left tonight. Showing tomorrow night.");
});

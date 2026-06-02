import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeEvents } from "./seatgeek.js";

const makeTmEvent = (overrides = {}) => ({
  id: "tm_1", source: "ticketmaster", name: "Concert",
  date: "2026-06-01", venue: "Madison Square Garden",
  priceMin: null, priceMax: null, isFree: false,
  availabilityTier: "unknown",
  ...overrides,
});

const makeSgEvent = (overrides = {}) => ({
  id: "sg_1", source: "seatgeek", name: "Concert",
  date: "2026-06-01", venue: "Madison Square Garden",
  priceMin: 50, priceMax: 200, isFree: false,
  availabilityTier: "available",
  ...overrides,
});

test("mergeEvents fills price when venue names overlap directly", async () => {
  const result = await mergeEvents([makeTmEvent()], [makeSgEvent()], new Map(), null);
  assert.equal(result.length, 1);
  assert.equal(result[0].priceMin, 50);
  assert.equal(result[0]._pricedBy, "seatgeek");
});

test("mergeEvents resolves venue via alias map", async () => {
  const aliasMap = new Map([["msg", "madisonsquaregarden"]]);
  const result = await mergeEvents(
    [makeTmEvent()],
    [makeSgEvent({ venue: "MSG" })],
    aliasMap,
    null
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].priceMin, 50);
});

test("mergeEvents keeps events separate when venues differ", async () => {
  const result = await mergeEvents(
    [makeTmEvent({ venue: "Madison Square Garden" })],
    [makeSgEvent({ venue: "Blue Note Jazz Club", name: "Jazz Show" })],
    new Map(),
    null
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].priceMin, null);
});

test("mergeEvents propagates isFree from SeatGeek match", async () => {
  const result = await mergeEvents(
    [makeTmEvent()],
    [makeSgEvent({ priceMin: 0, priceMax: 0, isFree: true })],
    new Map(),
    null
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].isFree, true);
  assert.equal(result[0].priceMin, 0);
});

test("mergeEvents skips price fill if SG event has null priceMin", async () => {
  const result = await mergeEvents(
    [makeTmEvent()],
    [makeSgEvent({ priceMin: null, priceMax: null })],
    new Map(),
    null
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].priceMin, null);
  assert.equal(result[0]._pricedBy, undefined);
});

test("mergeEvents does not duplicate events on date mismatch", async () => {
  const result = await mergeEvents(
    [makeTmEvent({ date: "2026-06-01" })],
    [makeSgEvent({ date: "2026-06-02" })],
    new Map(),
    null
  );
  assert.equal(result.length, 2);
});

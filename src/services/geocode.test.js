import { test } from "node:test";
import assert from "node:assert/strict";
import { isWithinNYC, extractPlace } from "./geocode.js";

const makePayload = (lat, lng, overrides = {}) => ({
  status: "OK",
  results: [
    {
      formatted_address: "163 W 10th St, New York, NY 10014, USA",
      geometry: { location: { lat, lng } },
    },
  ],
  ...overrides,
});

// ─── bounds guard ────────────────────────────────────────────────────────────

test("isWithinNYC accepts a real Manhattan venue", () => {
  assert.equal(isWithinNYC(40.7346, -74.001924), true); // Mezzrow
});

test("isWithinNYC accepts outer boroughs", () => {
  assert.equal(isWithinNYC(40.6782, -73.9442), true); // Brooklyn
  assert.equal(isWithinNYC(40.7282, -73.7949), true); // Queens
});

test("isWithinNYC rejects a same-named venue in another city", () => {
  assert.equal(isWithinNYC(41.8781, -87.6298), false); // Chicago
  assert.equal(isWithinNYC(34.0522, -118.2437), false); // Los Angeles
});

test("isWithinNYC rejects null island", () => {
  assert.equal(isWithinNYC(0, 0), false);
});

test("isWithinNYC rejects non-numeric and non-finite input", () => {
  assert.equal(isWithinNYC(null, null), false);
  assert.equal(isWithinNYC("40.73", "-74.00"), false);
  assert.equal(isWithinNYC(NaN, -74.0), false);
  assert.equal(isWithinNYC(undefined, undefined), false);
});

// ─── payload extraction ──────────────────────────────────────────────────────

test("extractPlace returns coords and address for an NYC result", () => {
  const place = extractPlace(makePayload(40.7346, -74.001924), "Mezzrow");
  assert.deepEqual(place, {
    lat: 40.7346,
    lng: -74.001924,
    address: "163 W 10th St, New York, NY 10014, USA",
  });
});

test("extractPlace returns null for ZERO_RESULTS", () => {
  assert.equal(extractPlace({ status: "ZERO_RESULTS", results: [] }, "Nowhere"), null);
});

test("extractPlace returns null when the match is outside NYC", () => {
  // "Birds" resolving to a bar in Los Angeles must not be written to the DB.
  assert.equal(extractPlace(makePayload(34.1016, -118.3269), "Birds"), null);
});

test("extractPlace returns null when geometry is missing", () => {
  const payload = { status: "OK", results: [{ formatted_address: "somewhere" }] };
  assert.equal(extractPlace(payload, "Broken"), null);
});

test("extractPlace returns null for an empty results array", () => {
  assert.equal(extractPlace({ status: "OK", results: [] }, "Empty"), null);
});

test("extractPlace coerces string coordinates before bounds checking", () => {
  const place = extractPlace(makePayload("40.7346", "-74.001924"), "Mezzrow");
  assert.equal(place.lat, 40.7346);
  assert.equal(place.lng, -74.001924);
});

test("extractPlace tolerates a missing formatted_address", () => {
  const payload = {
    status: "OK",
    results: [{ geometry: { location: { lat: 40.7346, lng: -74.001924 } } }],
  };
  assert.equal(extractPlace(payload, "Mezzrow").address, null);
});

test("extractPlace throws on a real API error so it surfaces in logs", () => {
  assert.throws(
    () => extractPlace({ status: "REQUEST_DENIED", error_message: "API key invalid" }, "Smalls"),
    /REQUEST_DENIED: API key invalid/
  );
});

test("extractPlace throws on OVER_QUERY_LIMIT rather than silently skipping", () => {
  assert.throws(
    () => extractPlace({ status: "OVER_QUERY_LIMIT" }, "Smalls"),
    /OVER_QUERY_LIMIT/
  );
});

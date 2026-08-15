import { test } from "node:test";
import assert from "node:assert/strict";
import {
  neighborhoodFor,
  distanceKm,
  MAX_MATCH_KM,
  NEIGHBORHOOD_CENTROIDS,
} from "./neighborhoods.js";
import { isWithinNYC } from "./geocode.js";

// Real coordinates, read out of the venues table. These are the rooms the app
// is actually about, so a centroid edit that moves any of them is a regression
// worth failing on — not a hypothetical.
const REAL_VENUES = [
  ["Bill's Place",        40.813374, -73.943643, "Harlem"],
  ["Birdland Jazz Club",  40.759017, -73.989686, "Theater District"],
  ["Blue Note Jazz Club", 40.730940, -74.000650, "Greenwich Village"],
  ["Bowery Ballroom",     40.720400, -73.993400, "Bowery"],
  ["Brooklyn Steel",      40.719400, -73.938800, "East Williamsburg"],
  ["Dizzy's Club",        40.768559, -73.983076, "Lincoln Square"],
  ["Irving Plaza",        40.734905, -73.988380, "Union Square"],
  ["Jazzcultural",        40.760708, -73.989657, "Hell's Kitchen"],
  ["Mercury Lounge",      40.722036, -73.986806, "Lower East Side"],
  ["Mezzrow",             40.734600, -74.001924, "West Village"],
  ["Smalls",              40.734387, -74.002765, "West Village"],
  ["The Django",          40.719409, -74.004909, "Tribeca"],
  ["The Sultan Room",     40.705600, -73.922300, "Bushwick"],
  ["Zinc Bar",            40.729671, -73.998991, "Greenwich Village"],
];

for (const [name, lat, lng, expected] of REAL_VENUES) {
  test(`${name} resolves to ${expected}`, () => {
    assert.equal(neighborhoodFor(lat, lng), expected);
  });
}

test("Smalls and Mezzrow are West Village, not Greenwich Village", () => {
  // Both sit on W 10th St, the boundary. Everyone who goes to them calls it
  // the West Village, and these are the two most-programmed rooms in the feed.
  assert.equal(neighborhoodFor(40.734387, -74.002765), "West Village");
  assert.equal(neighborhoodFor(40.734600, -74.001924), "West Village");
});

test("neighborhoodFor returns null for coordinates far from every centroid", () => {
  // Philadelphia. Better a missing label than a confidently wrong one.
  assert.equal(neighborhoodFor(39.9526, -75.1652), null);
});

test("neighborhoodFor rejects non-finite and non-numeric input", () => {
  assert.equal(neighborhoodFor(null, null), null);
  assert.equal(neighborhoodFor(undefined, undefined), null);
  assert.equal(neighborhoodFor("40.73", "-74.00"), null);
  assert.equal(neighborhoodFor(NaN, -74.0), null);
  assert.equal(neighborhoodFor(40.73, Infinity), null);
});

test("every centroid sits inside the NYC bounds geocode.js enforces", () => {
  // A centroid outside those bounds could never match a venue, because
  // geocode.js refuses to store coordinates there in the first place.
  for (const [name, lat, lng] of NEIGHBORHOOD_CENTROIDS) {
    assert.ok(isWithinNYC(lat, lng), `${name} (${lat}, ${lng}) is outside NYC_BOUNDS`);
  }
});

test("no two centroids share a name", () => {
  const names = NEIGHBORHOOD_CENTROIDS.map(([n]) => n);
  assert.equal(new Set(names).size, names.length, "duplicate neighborhood name");
});

test("no two centroids sit on top of each other", () => {
  // Centroids closer than ~250m make the winner between them arbitrary.
  for (let i = 0; i < NEIGHBORHOOD_CENTROIDS.length; i++) {
    for (let j = i + 1; j < NEIGHBORHOOD_CENTROIDS.length; j++) {
      const [aName, aLat, aLng] = NEIGHBORHOOD_CENTROIDS[i];
      const [bName, bLat, bLng] = NEIGHBORHOOD_CENTROIDS[j];
      const km = distanceKm(aLat, aLng, bLat, bLng);
      assert.ok(km > 0.25, `${aName} and ${bName} are only ${km.toFixed(2)}km apart`);
    }
  }
});

test("distanceKm is zero for a point against itself", () => {
  assert.equal(distanceKm(40.73, -74.0, 40.73, -74.0), 0);
});

test("distanceKm is symmetric", () => {
  const a = distanceKm(40.7128, -74.0060, 40.8116, -73.9465);
  const b = distanceKm(40.8116, -73.9465, 40.7128, -74.0060);
  assert.ok(Math.abs(a - b) < 0.01, `${a} vs ${b}`);
});

test("distanceKm matches a known NYC distance", () => {
  // Times Square to Washington Square Park is about 3.4 km as the crow flies.
  const km = distanceKm(40.7580, -73.9855, 40.7308, -73.9973);
  assert.ok(km > 3.0 && km < 3.8, `got ${km}`);
});

test("MAX_MATCH_KM is tight enough that a match means something", () => {
  // At 10km "nearest centroid" stops being a neighborhood and becomes a guess.
  assert.ok(MAX_MATCH_KM > 0 && MAX_MATCH_KM <= 5, `got ${MAX_MATCH_KM}`);
});

test("the centroid table covers all five boroughs", () => {
  // A regression guard for an edit that deletes a chunk of the table.
  const names = new Set(NEIGHBORHOOD_CENTROIDS.map(([n]) => n));
  for (const expected of ["Harlem", "Williamsburg", "Astoria", "Mott Haven", "St. George"]) {
    assert.ok(names.has(expected), `${expected} missing from the centroid table`);
  }
  assert.ok(NEIGHBORHOOD_CENTROIDS.length > 50, `only ${NEIGHBORHOOD_CENTROIDS.length} centroids`);
});

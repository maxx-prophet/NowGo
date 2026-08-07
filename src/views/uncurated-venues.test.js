import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  safeHref,
  formatNextEvent,
  renderUncuratedVenuesPage,
  DOCUMENTED_POLICIES,
} from "./uncurated-venues.js";

const venue = (over = {}) => ({
  venue_id: "v1",
  name: "Smoke Jazz Club",
  neighborhood: "Upper West Side",
  website: "https://smokejazz.com",
  events: 3,
  next_event: "2026-08-08T23:00:00.000Z",
  sources: "jazz_nyc",
  ...over,
});

test("escapeHtml neutralises markup", () => {
  assert.equal(
    escapeHtml(`<script>alert("x")</script>`),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
  );
  assert.equal(escapeHtml("Arthur's & Sons"), "Arthur&#39;s &amp; Sons");
});

test("escapeHtml renders null and undefined as empty, not the words", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("a venue name from a feed cannot inject markup into the page", () => {
  // Venue names arrive from Ticketmaster, SeatGeek and a scraped HTML table.
  // None of them are trusted input.
  const html = renderUncuratedVenuesPage([
    venue({ name: `<img src=x onerror="alert(1)">` }),
  ]);
  assert.ok(!html.includes("<img src=x"), "raw markup reached the page");
  assert.ok(html.includes("&lt;img src=x"), "name was not escaped");
});

test("safeHref accepts http and https", () => {
  assert.equal(safeHref("https://smallslive.com"), "https://smallslive.com/");
  assert.equal(safeHref("http://example.com/x"), "http://example.com/x");
});

test("safeHref rejects javascript: and other non-http schemes", () => {
  // website is whatever Google Place Details returned and is never re-validated
  // on write, so it is checked here rather than assumed clean.
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,<script>"), null);
  assert.equal(safeHref("file:///etc/passwd"), null);
  assert.equal(safeHref("not a url"), null);
  assert.equal(safeHref(null), null);
});

test("a venue with an unusable website renders as text, not a link", () => {
  const html = renderUncuratedVenuesPage([
    venue({ website: "javascript:alert(1)" }),
  ]);
  assert.ok(!html.includes("javascript:alert"), "unsafe href reached the page");
  assert.ok(html.includes("no site"));
});

test("a venue with no website renders without an empty link", () => {
  const html = renderUncuratedVenuesPage([venue({ website: null })]);
  assert.ok(html.includes("no site"));
});

test("formatNextEvent renders in Eastern time, not the server's UTC", () => {
  // Railway runs UTC. 23:00Z is 7pm ET, and a page that said 11pm would be
  // useless for deciding anything about tonight.
  const out = formatNextEvent("2026-08-08T23:00:00.000Z");
  assert.match(out, /7:00\s?PM/);
});

test("formatNextEvent handles a missing date", () => {
  assert.equal(formatNextEvent(null), "—");
});

test("the page lists venues and their event counts", () => {
  const html = renderUncuratedVenuesPage([
    venue({ name: "Birdland Jazz Club", events: 4 }),
    venue({ name: "Bar Bayeux", events: 2 }),
  ]);
  assert.ok(html.includes("Birdland Jazz Club"));
  assert.ok(html.includes("Bar Bayeux"));
  assert.match(html, /2 venues need a walk-in decision/);
  assert.match(html, /6 upcoming events/);
});

test("the page singularises correctly for one venue", () => {
  const html = renderUncuratedVenuesPage([venue({ events: 1 })]);
  assert.match(html, /1 venue needs? a walk-in decision/);
  assert.ok(!html.includes("1 venues"));
});

test("an empty worklist says so instead of rendering an empty table", () => {
  const html = renderUncuratedVenuesPage([]);
  assert.ok(html.includes("Every venue with upcoming events has a walk-in policy"));
  assert.ok(!html.includes("<tbody>"));
});

test("the legend documents every policy the schema allows", () => {
  // A policy value that exists in the CHECK constraint but is missing from the
  // legend leaves a curator guessing what to set.
  const html = renderUncuratedVenuesPage([venue()]);
  for (const policy of DOCUMENTED_POLICIES) {
    assert.ok(html.includes(`<dt>${policy}</dt>`), `${policy} missing from legend`);
  }
});

test("the page is not indexable", () => {
  // It exposes an internal worklist, not something to surface in search.
  const html = renderUncuratedVenuesPage([venue()]);
  assert.match(html, /<meta name="robots" content="noindex">/);
});

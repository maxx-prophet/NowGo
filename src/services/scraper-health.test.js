import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScraperHealth } from "./scraper-health.js";

// The query returns near-daily jazz-nyc venues (events on 5+ of the last 7
// days) that have nothing upcoming. Each row is a venue that went quiet.
function fakePool(rows) {
  return { query: async () => ({ rows }) };
}

const fetchStats = { jazz_nyc: { events: 89, rows: 661, keptNoArea: 12, skippedNoTime: 2 } };

test("a healthy run captures scraper_health with status ok and no missing venues", async () => {
  const captured = [];
  const report = await checkScraperHealth({
    pool: fakePool([]),
    fetchStats,
    capture: (event, props) => captured.push({ event, props }),
    log: () => {},
  });
  assert.equal(report.status, "ok");
  assert.equal(captured.length, 1);
  assert.equal(captured[0].event, "scraper_health");
  assert.equal(captured[0].props.source, "jazz_nyc");
  assert.equal(captured[0].props.status, "ok");
  assert.equal(captured[0].props.missing_count, 0);
  assert.deepEqual(captured[0].props.missing_venues, []);
  assert.equal(captured[0].props.events, 89);
  assert.equal(captured[0].props.kept_no_area, 12);
});

test("a near-daily venue with nothing upcoming is reported as missing and the run is degraded", async () => {
  const captured = [];
  const lines = [];
  const report = await checkScraperHealth({
    pool: fakePool([{ name: "Smalls", active_days: 7 }, { name: "Mezzrow", active_days: 6 }]),
    fetchStats,
    capture: (event, props) => captured.push(props),
    log: (l) => lines.push(l),
  });
  assert.equal(report.status, "degraded");
  assert.deepEqual(report.missing, ["Smalls", "Mezzrow"]);
  assert.equal(captured[0].status, "degraded");
  assert.equal(captured[0].missing_count, 2);
  assert.deepEqual(captured[0].missing_venues, ["Smalls", "Mezzrow"]);
  assert.ok(lines.some((l) => /Smalls/.test(l) && /Mezzrow/.test(l)), "the log names the venues");
});

test("zero events from the scraper is status empty even with nothing to compare against", async () => {
  const captured = [];
  const report = await checkScraperHealth({
    pool: fakePool([]),
    fetchStats: { jazz_nyc: { events: 0, rows: 0, keptNoArea: 0, skippedNoTime: 0 } },
    capture: (event, props) => captured.push(props),
    log: () => {},
  });
  assert.equal(report.status, "empty");
  assert.equal(captured[0].status, "empty");
});

test("a database error still captures, as status error, so the alert can see it", async () => {
  const captured = [];
  const report = await checkScraperHealth({
    pool: { query: async () => { throw new Error("connection reset"); } },
    fetchStats,
    capture: (event, props) => captured.push(props),
    log: () => {},
  });
  assert.equal(report.status, "error");
  assert.equal(captured[0].status, "error");
  assert.match(captured[0].error, /connection reset/);
});

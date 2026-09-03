import { test } from "node:test";
import assert from "node:assert/strict";

// fetchTicketmaster reads TM_API_KEY at module scope, so set it before import.
process.env.TM_API_KEY = "test-key";
const { fetchTicketmaster } = await import("./ticketmaster.js");

function stubFetch(pages) {
  const calls = [];
  const fetchImpl = async (url) => {
    const page = Number(new URL(url).searchParams.get("page"));
    calls.push({ url: String(url), page });
    const body = pages[page];
    if (body?.__status) {
      return { ok: false, status: body.__status, statusText: "Server Error" };
    }
    return { ok: true, status: 200, json: async () => body ?? { page: { totalPages: pages.length } } };
  };
  return { calls, fetchImpl };
}

const evt = (id) => ({
  id,
  name: `Event ${id}`,
  dates: { start: { localDate: "2026-09-01", localTime: "20:00:00" }, status: { code: "onsale" } },
  classifications: [{ segment: { name: "Comedy" }, genre: { name: "Comedy" } }],
  _embedded: { venues: [{ name: "Venue" }] },
});

const page = (ids, totalPages) => ({
  _embedded: { events: ids.map(evt) },
  page: { totalPages, totalElements: totalPages * ids.length },
});

test("every page is fetched, not just the first", async () => {
  // A single page of 50 sorted by date ascending dropped the late shows first —
  // exactly the events "tonight" means at 9pm, and where Comedy and Sports live.
  const { calls, fetchImpl } = stubFetch([page(["a", "b"], 3), page(["c", "d"], 3), page(["e", "f"], 3)]);
    const events = await fetchTicketmaster({ fetchImpl });
  assert.equal(calls.length, 3, "should walk all three pages");
  assert.deepEqual(calls.map((c) => c.page), [0, 1, 2]);
  assert.equal(events.length, 6);
});

test("a single-page result does not make a second request", async () => {
  const { calls, fetchImpl } = stubFetch([page(["a"], 1)]);
  await fetchTicketmaster({ fetchImpl });
  assert.equal(calls.length, 1);
});

test("a mid-run page failure keeps the events already collected", async () => {
  const { fetchImpl } = stubFetch([page(["a", "b"], 4), { __status: 500 }]);
    const events = await fetchTicketmaster({ fetchImpl });
  assert.equal(events.length, 2, "page 0 survives a failure on page 1");
});

test("a failure on the very first page still throws", async () => {
  const { fetchImpl } = stubFetch([{ __status: 401 }]);
  await assert.rejects(() => fetchTicketmaster(), /TM API error: 401/);
});

test("paging stops at Ticketmaster's 1000-result deep-paging cap", async () => {
  // Claims 50 pages; the cap allows only 1000/200 = 5.
  const many = Array.from({ length: 50 }, () =>
    page(Array.from({ length: 200 }, (_, i) => `e${i}`), 50)
  );
  const { calls, fetchImpl } = stubFetch(many);
  await fetchTicketmaster({ fetchImpl });
  assert.equal(calls.length, 5, "should stop at the documented cap");
});

test("the request window is UTC, which is what Ticketmaster expects", async () => {
  const { calls, fetchImpl } = stubFetch([page(["a"], 1)]);
  await fetchTicketmaster({ fetchImpl });
  const u = new URL(calls[0].url);
  assert.match(u.searchParams.get("startDateTime"), /Z$/);
  assert.match(u.searchParams.get("endDateTime"), /Z$/);
});

import { test } from "node:test";
import assert from "node:assert";
import { feedbackUrl, FEEDBACK_ADDRESS } from "./feedback.ts";

const ctx = { appVersion: "1.0.0", build: "12", device: "iPhone 15", osVersion: "18.6" };

function parse(url: string) {
  assert.ok(url.startsWith(`mailto:${FEEDBACK_ADDRESS}?`), url);
  const q = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  return { subject: q.get("subject") ?? "", body: q.get("body") ?? "" };
}

test("general feedback goes to hello@ with the build and device filled in", () => {
  const { subject, body } = parse(feedbackUrl(ctx));
  assert.equal(FEEDBACK_ADDRESS, "hello@nowgoapp.com");
  assert.equal(subject, "NowGo feedback");
  assert.ok(body.includes("Build 1.0.0 (12)"), body);
  assert.ok(body.includes("iPhone 15, iOS 18.6"), body);
});

test("the tester's space comes first and the details sit below a divider", () => {
  // People write above whatever is pre-filled. Putting the details first makes
  // the message look like a form and the tester stops before saying anything.
  const { body } = parse(feedbackUrl(ctx));
  assert.ok(body.startsWith("\n\n"), JSON.stringify(body));
  assert.ok(body.indexOf("———") < body.indexOf("Build"));
});

test("a report from an event names the event, venue, time and id", () => {
  const { subject, body } = parse(
    feedbackUrl(ctx, {
      event_id: "tm_Z7r9jZ1AAv7AJ",
      name: "Lekan",
      venue_name: "Blue Note Jazz Club",
      start_time: "2026-09-26T00:00:00.000Z",
    })
  );
  assert.equal(subject, "Problem with: Lekan");
  assert.ok(body.includes("Blue Note Jazz Club"));
  assert.ok(body.includes("tm_Z7r9jZ1AAv7AJ"), "the id is what lets a report be traced to a row");
  assert.ok(body.includes("8:00 PM"), "start time in New York time, as the app shows it");
});

test("characters that would break a mailto link are encoded", () => {
  const url = feedbackUrl(ctx, {
    event_id: "x", name: "Rock & Roll? #1", venue_name: "A=B", start_time: "2026-09-26T00:00:00.000Z",
  });
  const { subject, body } = parse(url);
  assert.equal(subject, "Problem with: Rock & Roll? #1");
  assert.ok(body.includes("A=B"));
  assert.ok(!url.includes(" "), "no raw spaces in the URL");
});

test("missing device details do not print undefined", () => {
  const { body } = parse(feedbackUrl({ appVersion: null, build: null, device: null, osVersion: null }));
  assert.ok(!body.includes("undefined"));
  assert.ok(!body.includes("null"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { isCramped, CRAMPED_FONT_SCALE, CRAMPED_WIDTH } from "./cramped.ts";

// A 6.1" iPhone is ~393pt wide at default text. Nothing needs to stack.
test("a normal phone at default text is not cramped", () => {
  assert.equal(isCramped({ fontScale: 1, width: 393 }), false);
});

// Dynamic Type: the axis the original fixes were written for.
test("large accessibility text is cramped regardless of width", () => {
  assert.equal(isCramped({ fontScale: 1.35, width: 393 }), true);
  assert.equal(isCramped({ fontScale: 2.1, width: 430 }), true);
});

test("a modestly larger text size is still not cramped", () => {
  assert.equal(isCramped({ fontScale: 1.2, width: 393 }), false);
});

// Display Zoom: the axis they missed. A zoomed 6.1" iPhone reports ~320pt
// wide with fontScale still 1.0 — the tester's exact setup on 2026-09-14.
test("a Display Zoomed phone at default text is cramped", () => {
  assert.equal(isCramped({ fontScale: 1, width: 320 }), true);
});

// iPhone SE (375pt) is narrow but fits the unstacked layouts; it must not
// be swept up by the width rule.
test("an iPhone SE at default text is not cramped", () => {
  assert.equal(isCramped({ fontScale: 1, width: 375 }), false);
});

test("thresholds are the documented ones", () => {
  assert.equal(CRAMPED_FONT_SCALE, 1.35);
  assert.equal(CRAMPED_WIDTH, 360);
});

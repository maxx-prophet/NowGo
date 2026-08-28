import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_CATEGORIES,
  NO_BUDGET,
  toggleCategory,
  toggleBudget,
  isFiltered,
} from "./filters.ts";

test("tapping a category that is not selected selects it", () => {
  assert.equal(toggleCategory("All", "Jazz"), "Jazz");
});

// The reported bug: the chip renders as selected, so tapping it should
// unselect it. It used to be a no-op, leaving the user no way back.
test("tapping the selected category clears it", () => {
  assert.equal(toggleCategory("Jazz", "Jazz"), ALL_CATEGORIES);
});

test("tapping All while already on All stays on All rather than toggling to nothing", () => {
  assert.equal(toggleCategory(ALL_CATEGORIES, ALL_CATEGORIES), ALL_CATEGORIES);
});

test("tapping a price that is not selected selects it", () => {
  assert.equal(toggleBudget(NO_BUDGET, 50), 50);
});

test("tapping the selected price clears it", () => {
  assert.equal(toggleBudget(50, 50), NO_BUDGET);
});

// Free is 0, which is falsy — the kind of value a truthiness check silently
// drops. It is a real filter and must behave like one.
test("Free is a real filter, and tapping it again clears it", () => {
  assert.equal(toggleBudget(NO_BUDGET, 0), 0);
  assert.equal(toggleBudget(0, 0), NO_BUDGET);
});

test("tapping Any always lands on the no-budget state", () => {
  assert.equal(toggleBudget(25, NO_BUDGET), NO_BUDGET);
  assert.equal(toggleBudget(NO_BUDGET, NO_BUDGET), NO_BUDGET);
});

test("an untouched feed is not filtered", () => {
  assert.equal(isFiltered({ category: ALL_CATEGORIES, budgetMax: NO_BUDGET, walkInsOnly: false }), false);
});

// "Any" means no price limit. Reporting it as an active filter made the empty
// state blame filters for a feed that was empty for some other reason.
test("choosing Any is not a filter", () => {
  assert.equal(isFiltered({ category: ALL_CATEGORIES, budgetMax: NO_BUDGET, walkInsOnly: false }), false);
});

test("Free counts as filtered even though zero is falsy", () => {
  assert.equal(isFiltered({ category: ALL_CATEGORIES, budgetMax: 0, walkInsOnly: false }), true);
});

test("a chosen category counts as filtered", () => {
  assert.equal(isFiltered({ category: "Comedy", budgetMax: NO_BUDGET, walkInsOnly: false }), true);
});

test("walk-ins only counts as filtered", () => {
  assert.equal(isFiltered({ category: ALL_CATEGORIES, budgetMax: NO_BUDGET, walkInsOnly: true }), true);
});

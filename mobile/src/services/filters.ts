// Filter state for the tonight feed.
//
// Both chip rows render a selected state, so tapping the selected chip has to
// unselect it — that used to be a no-op, which left a user who had picked a
// category or a price with no way back short of the "Clear filters" button,
// and that button only appears when the feed is empty.
//
// The neutral budget is `undefined`, not `null`. "Any" means no price limit,
// and when it carried its own distinct value the feed counted it as an active
// filter: an empty late-night feed then blamed the user's filters instead of
// the hour.

export const ALL_CATEGORIES = "All";

/** No price limit. Distinct from 0, which is the Free filter. */
export const NO_BUDGET = undefined;

export type BudgetMax = number | undefined;

export function toggleCategory(current: string, tapped: string): string {
  return tapped === current ? ALL_CATEGORIES : tapped;
}

export function toggleBudget(current: BudgetMax, tapped: BudgetMax): BudgetMax {
  return tapped === current ? NO_BUDGET : tapped;
}

export function isFiltered({
  category,
  budgetMax,
  walkInsOnly,
}: {
  category: string;
  budgetMax: BudgetMax;
  walkInsOnly: boolean;
}): boolean {
  // Compared against undefined rather than checked for truthiness, because the
  // Free filter is 0.
  return category !== ALL_CATEGORIES || budgetMax !== NO_BUDGET || walkInsOnly;
}

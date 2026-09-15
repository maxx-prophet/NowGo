// When to trade the side-by-side layouts for stacked ones.
//
// iOS has two separate ways to make everything bigger, and they show up in
// different numbers:
//
// - Larger Text (Accessibility → Display & Text Size) scales type. React
//   Native reports it as fontScale. The original large-text fixes keyed on
//   this alone.
// - Display Zoom (Display & Brightness) renders the whole phone at a smaller
//   logical size: a 6.1" iPhone reports ~320pt wide instead of ~393, and
//   fontScale does not move at all.
//
// A tester on 2026-09-14 had Display Zoom on and text size at the default,
// so every fontScale trigger stayed off while the viewport lost ~20% of its
// width — the same crush the fixes existed to prevent. Both axes count.

export const CRAMPED_FONT_SCALE = 1.35;

// Between Display Zoom (~320) and the narrowest un-zoomed iPhone (SE, 375),
// which renders the unstacked layouts fine.
export const CRAMPED_WIDTH = 360;

export function isCramped({ fontScale, width }: { fontScale: number; width: number }): boolean {
  return fontScale >= CRAMPED_FONT_SCALE || width < CRAMPED_WIDTH;
}

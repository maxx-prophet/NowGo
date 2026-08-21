// Why the feed came back empty.
//
// "No events tonight" used to be the only answer, and outside NYC it was a lie:
// there were fifty events, just none within the search radius. Telling a
// travelling user the city had nothing on read as a dead app.
//
// Distinguishing the cases needs one extra fact — whether events exist when the
// location filter is dropped — so the caller probes for that and passes the
// count in. `null` means the probe did not run.

export type EmptyReason = "filtered" | "outside-coverage" | "none-tonight";

export function emptyReason({
  isFiltered,
  usedLocation,
  nationwideCount,
}: {
  isFiltered: boolean;
  usedLocation: boolean;
  nationwideCount: number | null;
}): EmptyReason {
  // Filters are the more actionable explanation and the user set them
  // deliberately, so they win. Clearing them is one tap, and if the result is
  // still empty the next load reports coverage instead.
  if (isFiltered) return "filtered";

  // Only a located request can be outside the coverage area — an unlocated one
  // already searched everywhere. Requires positive proof from the probe:
  // without it, a genuinely quiet night in NYC would be misreported as the user
  // being in the wrong city, which is the same class of bug as the original.
  if (usedLocation && nationwideCount != null && nationwideCount > 0) {
    return "outside-coverage";
  }

  return "none-tonight";
}

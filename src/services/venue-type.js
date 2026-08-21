// Attractions — museums, observation decks, immersive exhibits — sell timed
// entry to one standing experience. Ticketing APIs give every slot its own
// event id, so a single museum can contribute dozens of near-identical rows.
// On 2026-08-21 three of them were 39 of 150 events, a quarter of the feed,
// and six of the first eight rows.
//
// They are excluded from the default feed rather than deleted: a museum is a
// perfectly reasonable thing to want, just not something "happening" in the
// sense the feed is answering. Pass include_attractions=true to get them back.
//
// NULL-safe on purpose. An event whose venue row is missing, or a venue nobody
// has curated yet, must still appear — 'unknown' means we have not looked, not
// that the venue is an attraction. Excluding on absence of evidence would
// silently empty the feed as new venues arrive.
export const NOT_ATTRACTION_SQL = `COALESCE(v.venue_type, 'unknown') <> 'attraction'`;

// The worklist query. Name matching is fit for suggesting candidates to a
// human and unfit for filtering: a jazz concert at the Whitney is a real event
// at a museum, and this pattern would catch it.
export const ATTRACTION_CANDIDATES_SQL = `
  SELECT venue_id, name
    FROM venues
   WHERE name ~* 'museum|gallery|zoo|aquarium|observator|exhibit'
     AND COALESCE(venue_type, 'unknown') = 'unknown'
   ORDER BY name`;

export async function fetchAttractionCandidates(pool) {
  const { rows } = await pool.query(ATTRACTION_CANDIDATES_SQL);
  return rows;
}

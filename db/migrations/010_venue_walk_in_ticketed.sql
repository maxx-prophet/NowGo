-- ─── WALK-IN SWEEP: VENUES THAT REQUIRE AN ADVANCE TICKET ────────────────────
-- 009 seeded the venues you CAN walk into. This seeds the other end: venues
-- where advance purchase is genuinely required, so they resolve to 'none'
-- rather than sitting at 'unknown' forever.
--
-- Why this matters beyond the filter: reportUncuratedVenues() in
-- src/services/walk-in.js names every 'unknown' venue after each pipeline run.
-- With ~270 venues uncurated that log line is unreadable, so the signal it
-- exists to provide is lost. Resolving the categories that have one obvious
-- answer leaves a short list of venues that genuinely need a human decision.
--
-- Scope is deliberately narrow — three categories where the answer is
-- structural, not a judgement call:
--
--   1. Reserved-seat theatres (Broadway, off-Broadway, Lincoln Center)
--   2. Stadiums and arenas
--   3. Timed-entry museums and exhibits
--   4. Reserved-seat concert halls, opera, ballet and performing arts centres
--
-- Rush, lottery and standing-room programmes exist at many Broadway houses.
-- They are NOT walk-ins: they are a queue or a draw for a limited allocation,
-- which is what 'standby' means, and they run on the venue's own schedule
-- rather than per event. Treating them as walk-ins would promise a user
-- something the venue does not offer, so these stay 'none' until a source
-- tells us otherwise per show.
--
-- General-admission music clubs (Bowery Ballroom, Mercury Lounge, Webster
-- Hall, Brooklyn Steel, Elsewhere, ...) are deliberately NOT swept. Door sales
-- at a non-sold-out GA show are common but not guaranteed, which makes them a
-- real 'space_permitting' judgement per venue rather than a category answer.
-- They stay 'unknown' until researched — the same reasoning that left Birdland
-- uncurated in 009.
--
-- As in 009, every statement is guarded with
-- `COALESCE(walk_in_policy,'unknown') = 'unknown'` because db/migrate.js
-- re-runs every migration on every run. A hand-curated venue is never
-- overwritten.
--
-- Names are matched on a normalised form — lowercased, trimmed, internal
-- whitespace collapsed — because the venues table carries trailing spaces
-- ("Broadhurst Theatre ") and doubled spaces ("Lincoln Center-  Mitzi E.
-- Newhouse") from the upstream feeds. 009 matched on plain lower(name) and
-- did not need this; these lists do.

-- ─── 1. RESERVED-SEAT THEATRES ───────────────────────────────────────────────
-- Broadway, off-Broadway and Lincoln Center houses. Ticketed seat assignments;
-- there is no door.

UPDATE venues SET walk_in_policy = 'none'
 WHERE regexp_replace(lower(btrim(name)), '\s+', ' ', 'g') IN (
   '59e59 theaters',
   'actor''s temple theater - ny',
   'al hirschfeld theatre',
   'ambassador theatre',
   'ambassador theatre - new york',
   'ambassador theatre-ny',
   'astor place theatre - new york',
   'audible''s minetta lane theatre',
   'august wilson theatre',
   'august wilson theatre-ny',
   'barrymore theatre - new york',
   'barrymore theatre-ny',
   'belasco theatre',
   'belasco theatre - ny',
   'bernard b. jacobs theatre',
   'booth theatre',
   'booth theatre - new york',
   'broadhurst theatre',
   'broadway theatre',
   'broadway theatre - new york',
   'broadway theatre-new york',
   'cherry lane theatre',
   'circle in the square theatre',
   'daryl roth theatre',
   'dr2',
   'dr2 theatre',
   'ethel barrymore theatre',
   'eugene o''neill theatre',
   'gerald schoenfeld theatre',
   'gershwin theatre',
   'helen hayes theatre',
   'hudson theatre - new york',
   'hudson theatre -ny',
   'imperial theatre',
   'imperial theatre - ny',
   'jacobs theatre-ny',
   'james earl jones theatre',
   'john golden theatre',
   'laura pels theater',
   'laura pels theatre',
   'lena horne theatre',
   'longacre theatre',
   'lucille lortel theatre',
   'lunt-fontanne theatre',
   'lyceum theatre',
   'lyceum theatre - ny',
   'lyric theatre - new york',
   'lyric theatre - ny',
   'majestic theatre-ny',
   'marquis theatre',
   'marquis theatre - new york',
   'marquis theatre - ny',
   'minetta lane theatre',
   'minskoff theatre',
   'music box theatre',
   'music box theatre - ny',
   'music box theatre-ny',
   'nederlander theatre',
   'nederlander theatre - ny',
   'neil simon theatre',
   'new amsterdam theatre',
   'new world stages - stage 1',
   'new world stages - stage 2',
   'new world stages - stage 3',
   'new world stages - stage 4',
   'new world stages - stage 5',
   'palace theatre - new york',
   'palace theatre new york',
   'palace theatre-ny',
   'public theater - martinson hall',
   'richard rodgers theatre',
   'richard rodgers theatre-ny',
   'samuel j friedman theatre',
   'samuel j. friedman theatre',
   'shubert theatre',
   'shubert theatre - ny',
   'shubert theatre-ny',
   'st. james theatre',
   'st. luke''s theatre',
   'stage 42',
   'stephen sondheim theatre',
   'stephen sondheim theatre - new york',
   'studio 54',
   'studio seaview',
   'the hayes theater',
   'the ruby theatre',
   'the theater center',
   'theatre xiv',
   'todd haimes theatre',
   'walter kerr theatre',
   'westside theatre upstairs',
   'westside theatre upstairs - ny',
   'winter garden theatre',
   'winter garden theatre - ny',
   -- Lincoln Center resident theatres. The feeds emit eight spellings of the
   -- same two rooms; all of them are listed rather than pattern-matched so a
   -- future spelling fails visibly instead of being silently swept.
   'lincoln center - claire tow theater',
   'lincoln center- mitzi e. newhouse',
   'lincoln center - mitzi e. newhouse theater',
   'lincoln center theater - mitzi e. newhouse',
   'lincoln center theater - vivian beaumont',
   'lincoln center theater - vivian beaumont theater',
   'lincoln center - vivian beaumont',
   'lincoln center - vivian beaumont theater'
 )
 AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── 2. STADIUMS AND ARENAS ──────────────────────────────────────────────────
-- Ticketed entry with bag check and gates. No walk-up admission.

UPDATE venues SET walk_in_policy = 'none'
 WHERE regexp_replace(lower(btrim(name)), '\s+', ' ', 'g') IN (
   'barclays center',
   'citi field',
   'forest hills stadium',
   'icahn stadium',
   'infosys theater at madison square garden',
   'louis armstrong stadium',
   'madison square garden',
   'metlife stadium',
   'siuh community park',
   'sports illustrated stadium',
   'yankee stadium'
 )
 AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── 3. TIMED-ENTRY MUSEUMS AND EXHIBITS ─────────────────────────────────────
-- Sold as a dated, timed admission slot. Balloon Museum and Banksy Museum
-- alone account for 38 of the upcoming events, and both are ticketed
-- exhibits rather than anything you can drop in on.

UPDATE venues SET walk_in_policy = 'none'
 WHERE regexp_replace(lower(btrim(name)), '\s+', ' ', 'g') IN (
   'balloon museum nyc',
   'banksy museum new york',
   'museum of chinese in america',
   'radio city music hall tour experience'
 )
 AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── 4. CONCERT HALLS, OPERA, BALLET, PERFORMING ARTS CENTRES ────────────────
-- Reserved seating, same as the theatres above.

UPDATE venues SET walk_in_policy = 'none'
 WHERE regexp_replace(lower(btrim(name)), '\s+', ' ', 'g') IN (
   'apollo theater',
   'bam howard gilman opera house',
   'baruch performing arts center',
   'beacon theatre',
   'bergen performing arts center',
   'carnegie hall',
   'carnegie hall - judy & arthur zankel hall',
   'david geffen hall',
   'david h koch theater',
   'joyce theater',
   'joyce theater - ny',
   'lehman center for the performing arts',
   'metropolitan opera house',
   'new jersey performing arts center',
   'new york city center',
   'perelman performing arts center',
   'prudential hall at new jersey performing arts center',
   'radio city music hall',
   'the apollo''s jonelle procope theater',
   'the apollo''s victoria theater 1',
   'the town hall - new york',
   'town hall',
   'tribeca performing arts center',
   'united palace',
   'victoria theater at new jersey performing arts center'
 )
 AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

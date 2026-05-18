# NowGo — Market Analysis & Investor Preparation
*Generated May 16, 2026*

---

## Three-Expert Market Analysis

---

### Expert 1: Venture Capitalist

**TAM / SAM / SOM**
The global live events market is ~$85B, but the software/discovery layer — where NowGo operates — is a fraction of that: ~$3–5B globally. NYC-first SAM is meaningful (8M residents + 60M annual tourists), but realistic SOM in years 1–3 is $5–15M ARR — not a $100B market. This is a niche aggregator play.

**Competitive Moat**
This is the core problem. Eventbrite, Bandsintown, Songkick, Google Events, Yelp, and TikTok Events all solve adjacent versions of this. Crucially, Ticketmaster and SeatGeek — NowGo's own data suppliers — have their own consumer discovery surfaces. The "surprise score" and "leave by" features are differentiated UX ideas, but not defensible at the infrastructure level. A moat requires a behavioral data flywheel, local venue relationships, or a community layer. None exist yet.

**Revenue Options**
- Affiliate/referral on ticket sales (Bandsintown model) — low margin, commoditized
- Promoted venue listings — viable but fragmented, high sales CAC
- Premium subscription — small TAM, hard retention
- B2B API to hotels/concierge — interesting but capped

Best comp: Bandsintown monetizes at ~$0.30–0.80 per MAU. At 500K NYC MAUs, that's $150K–$400K/month — real money, but not venture-scale without city expansion.

**Exit Pathways**
Strategic acquirers: Live Nation/Ticketmaster (data enrichment), Yelp, Google Maps, Citymapper. M&A at $20–50M is plausible. $100M+ requires 3–5 cities.

**Stage:** Pre-seed. Appropriate raise: $500K–$1.5M to prove DAU/MAU ratio and return visit rate before any Series A conversation.

---

### Expert 2: Technical Product Lead

**Architecture Verdict:** Sound foundation, incomplete product.
Source-prefixed IDs, normalized schema, and the PostGIS geo index are the right early decisions. The fetcher-per-source pattern is clean. PostGIS is absolutely the right call — `ST_DWithin` + `GEOGRAPHY` type for accurate meter-based distance is exactly what "near me" requires.

**Biggest Technical Risks**

1. **The SeatGeek merger is fragile.** Fuzzy venue-name + date matching will produce false positives at scale. "Madison Square Garden" vs. "MSG" vs. "The Garden" will collide. This needs a canonical venue registry with alias tables before any real data volume.

2. **No data freshness strategy.** Ticketmaster's free API tier allows ~5,000 requests/day. No caching, no scheduler, no retry logic — one failed run is a silent data gap. For a "tonight" product, staleness is fatal.

3. **The core features are null.** `travel_minutes`, `leave_by_time`, and `surprise_score` are in the schema but unbuilt. These aren't polish — they're the entire product differentiation.

**How Far From MVP:** Further than the codebase suggests. Still needed: a job scheduler (cron/BullMQ), an API server, a Redis caching layer, and the entire consumer-facing layer. Realistically 6–8 weeks of focused engineering to get to something demo-able.

**Hardest Unsolved Problem:** Real-time travel time. Google Maps Distance Matrix adds per-request cost that scales with users × events in radius. Pre-computing "leave by" requires knowing when the user opens the app, not when data was fetched. This demands a push/event-driven architecture, not REST polling.

**Additional Flags:**
- No idempotency on event inserts — re-runs will duplicate records
- No soft deletes — stale cancelled events will accumulate
- Zero test coverage on the fuzzy matching logic

---

### Expert 3: Startup Marketer

**Target User**
NYC residents 25–44 with discretionary income and spontaneous intent — roughly 2–3M people plausibly fit, but the slice that would open a dedicated app rather than Googling is far smaller. Tourists are high-volume but low-retention and will corrupt cohort metrics early.

**Competitive Landscape**
A crowded graveyard: Fever (push-heavy, strong in experiential), TimeOut NY (editorial authority), Eventbrite (catalog, poor discovery UX), Do NYC, Google Events (zero-click in search), Bandsintown/Songkick (music vertical), Resident Advisor (nightlife), Facebook Events (older demos), TikTok (where Gen Z actually discovers tonight's plans).

**Genuine Differentiation**
Aggregating TM + SeatGeek + NYC Parks is table stakes and easily replicated. The "leave by" time is genuinely useful and underserved — nobody does this well. The surprise score is interesting positioning but is a UI feature, not a category. Real differentiation only exists if NowGo executes the last-mile UX ("tonight, near me, I can still make it") consistently better than everyone else.

**Acquisition Reality**
Pre-launch with no app: hyper-local NYC TikTok/Instagram content, influencer seeding with lifestyle creators, and App Store optimization around "tonight NYC" queries. Paid acquisition without retention data is burning money. Expect $4–8 CAC minimum in this market.

**Retention Problem**
Currently thin. No social layer, no personalization, no push notification strategy. Fever survives on aggressive push + editorial curation. NowGo needs at least one sticky loop — weekly digests, saved preferences, or friend sharing — before it has a retention story.

**Top Red Flags**
1. No moat — API aggregation is replicable in weeks by a well-funded competitor
2. No retention mechanism described
3. Tourist users destroy cohort metrics and mislead early PMF signals
4. Google's zero-click event results are a ceiling on organic acquisition
5. Pre-launch with no waitlist, community, or content engine — cold start is brutal in this vertical

---

## Market Fit Determination

**Status: Pre-PMF. The problem is real. The solution is incomplete.**

| Dimension | Assessment |
|---|---|
| Problem validity | Strong — "what's happening tonight near me" is genuinely underserved |
| Current solution | Weak — data pipeline without consumer product |
| Differentiation | Thin now; strong *only if* travel time + surprise score get built |
| Competitive risk | High — Google, Fever, and TikTok can replicate the aggregation |
| Scalability | Possible — geo-based architecture transfers to other cities |
| Monetization | Undefined |

The core thesis is sound: nobody combines real-time multi-source aggregation + travel-time awareness + free events in one place. But the thesis requires building the things that are currently `null` in the schema.

---

## Red Flags Summary

| # | Red Flag | Severity |
|---|---|---|
| 1 | **API dependency** — Ticketmaster and SeatGeek can throttle, reprice, or terminate access. The entire supply layer is rented, not owned | Critical |
| 2 | **No mobile app** — this is a phone-in-hand, 8pm decision use case. The product doesn't exist where the decision is made | Critical |
| 3 | **Core features are `null`** — `travel_minutes`, `leave_by_time`, `surprise_score` are schema fields but unbuilt | High |
| 4 | **No monetization model** — no affiliate links, no ad slots, no conversion tracking in the architecture | High |
| 5 | **Google Events is a ceiling** — zero-click search results cap organic discovery | High |
| 6 | **Fuzzy venue matching will break at scale** — the SeatGeek deduplication logic is fragile | Medium |
| 7 | **Tourist users will mislead early metrics** — inflate downloads, distort retention cohorts | Medium |

---

## Are the Technical Problems Solvable?

**Yes — all of them.** None require novel engineering. They are execution problems with known solutions.

| Problem | Solution | Difficulty |
|---|---|---|
| API dependency | Cache aggressively, add more sources (Dice, RA, Broadway), build proprietary venue data over time | Medium |
| No mobile app | React Native — one codebase for iOS + Android | Medium |
| Travel time (`leave_by_time`) | Google Maps Distance Matrix API, cached by venue + neighborhood centroid with TTL | Medium-Hard |
| Surprise score | Weight by rarity of genre + seats remaining + proximity. Improve with user behavior data | Medium |
| Fuzzy venue deduplication | Canonical venue table with alias columns. One-time data work | Medium |
| No scheduler | BullMQ or Railway cron job | Easy |
| No API server | Express or Fastify — one weekend | Easy |

The hardest single problem is **travel time at scale** — it must be computed relative to the user's current location at query time, not pre-baked. The right approach: pre-compute from neighborhood centroids to each venue, cache in DB, serve approximate results. Not perfect, good enough for V1.

The technical foundation (PostGIS, normalized schema, multi-source deduplication) is exactly the right base. Remaining work is building the product layer on top.

---

## Getting in Front of Growth-Stage Investors

### The Funding Sequence

```
Pre-seed → Seed → Series A (growth-stage) → Series B+
```

NowGo is at **pre-seed** right now. Growth-stage (Series A) is not the next conversation — it's 18–24 months away if things go well.

### What Each Stage Means

**Pre-seed ($250K–$1.5M)**
- What it buys: time to build MVP and get first users
- What investors want: compelling thesis + team they believe in + working prototype
- Who invests: angel investors, NYC-focused small funds (Lerer Hippeau, Betaworks, RRE Ventures)

**Seed ($1.5M–$5M)**
- What it buys: grow the team, reach meaningful user numbers
- What investors want: evidence the product is working — retention data, early DAU/MAU signal, proof people come back

**Series A / Growth-stage ($5M–$20M+)**
- What it buys: scale what's working — paid acquisition, new cities, expanded team
- What investors want: **repeatable growth metrics:**
  - DAU/MAU ratio above 20% (shows habitual use)
  - Retention curve that flattens rather than drops to zero
  - CAC:LTV ratio of at least 3:1
  - Proof the model works in one market before asking for money to expand

### How to Prepare (In Order)

1. **Build the MVP first.** A mobile app with working travel time and the surprise score — even rough. You cannot raise on a data pipeline alone.

2. **Get 500–1,000 real NYC users.** Not signups — people who open the app more than once. This is your proof of concept.

3. **Track the right metrics from day one.** Set up Mixpanel or Amplitude before launch. Measure: return visit rate (D7, D30), session depth, which features drive return visits, where users drop off.

4. **Build a 10-slide deck:**
   - The problem
   - Why now
   - Why you
   - How it works
   - Traction (even small numbers)
   - Market size
   - The ask

5. **Get warm introductions.** Cold outreach to VCs rarely works. Path: find angels who know the events/NYC/consumer app space → close pre-seed → let them introduce you to Series A funds when the metrics are there.

6. **Don't raise too early.** Pitching before you have retention data means "come back when you have more traction" — a door that's hard to re-open with the same story.

### The Honest Near-Term Roadmap

```
Build mobile MVP  →  Get real NYC users  →  Prove D30 retention  →  Raise pre-seed  →  Scale
```

---

*Document generated from NowGo codebase analysis and three-expert market review.*
*Internal use only — not for distribution.*

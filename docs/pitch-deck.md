# NowGo — Investor Pitch Deck
*Pre-Seed Round | May 2026 — build status revised 16 August 2026*

> **Status note.** This deck was written in May 2026, before the mobile app existed. The
> build status and architecture slides have been corrected below. The **ask and roadmap
> slides have deliberately not been updated**: by this deck's own Series A checklist, a
> pre-seed conversation needs 500–1,000 users and D30 retention data, and NowGo currently
> has neither. Do not circulate this to investors until there is retention data to put in
> it.

---

## SLIDE 1 — Cover

# NowGo
### The spontaneous night out, solved.

*Real-time NYC event discovery with travel-time intelligence*

**[Pre-Seed Round | Confidential]**

---

## SLIDE 2 — The Problem

# "What should I do tonight?"

Every night, millions of New Yorkers ask this question. The answer is broken.

- **Events are scattered** across Ticketmaster, SeatGeek, Eventbrite, NYC Parks, and dozens of venue sites
- **No tool tells you what you can still make it to** — everything shows start times, not leave-by times
- **Free events are invisible** — the best free concerts and parks events don't show up in commercial apps
- **Price comparison is manual** — finding the cheapest ticket requires three separate platforms

> The result: people default to nothing, or the same familiar bar. NYC's extraordinary event ecosystem goes undiscovered.

---

## SLIDE 3 — The Solution

# NowGo: One feed. Right now. You can make it.

NowGo aggregates events happening in NYC tonight — Ticketmaster, SeatGeek, and a curated jazz-club scraper — normalizes pricing and availability, and tells you exactly when to leave based on your current location.

**Three things no one else does together:**

| Feature | What it means |
|---|---|
| Multi-source aggregation | One search across all platforms |
| Live travel time | "Leave by 7:43pm" — not just a start time |
| Surprise Score | Serendipitous picks you wouldn't have searched for |

---

## SLIDE 4 — How It Works

# Under the Hood

```
Ticketmaster API  ──┐
SeatGeek API      ──┼──▶  Normalized Event Store (PostgreSQL)
Jazz NYC scraper  ──┘            │
                                 ▼
                     Geo-ranked feed by proximity
                                 │
                                 ▼
                     + Travel time overlay (Google Maps)
                                 │
                                 ▼
                     + Surprise Score engine
                                 │
                                 ▼
                         NowGo Mobile App
```

**Key technical decisions already made:**
- Bounding-box geo filtering on indexed lat/lng — PostGIS is not available on Railway, so distance is computed arithmetically
- Source-prefixed event IDs prevent duplication across sources
- Availability snapshots log price + status changes over time
- Railway-hosted PostgreSQL — scalable, managed, zero ops overhead

---

## SLIDE 5 — Current Build Status

# What's Done. What's Next.

### Completed ✅
- PostgreSQL event store on Railway; 6,436 events ingested since 2 June, ~150 per night
- Data pipeline live on a four-times-daily schedule: Ticketmaster, SeatGeek, Jazz NYC
- Normalized event schema (20+ fields: price, availability, geo, segment, genre)
- Multi-source deduplication, venue alias merging, and price-fill logic
- Express API server + node-cron scheduler — both shipped
- Travel time engine — "leave by" is live and working
- Surprise Score — live
- **iOS app shipped to TestFlight; stable build running over a week**
- Hand-curated walk-in policies across 168 NYC venues
- PostHog analytics instrumented and confirmed reporting from production

### In Progress 🔧
- Recruiting the first real testers (currently zero)
- Building the five launch-ready metrics in PostHog

### To Build 📋
- User accounts + preference learning
- Push notifications
- Android

### Honest gaps ⚠️
- **Price coverage is ~5%** — only 313 of 6,436 events carry a price, so budget filtering
  has little to work on
- **Availability is Ticketmaster-only** — SeatGeek returns no availability for club shows,
  leaving general-admission venues largely unknown
- **No users yet** — the product ships; nobody has been invited to it

---

## SLIDE 6 — Market Opportunity

# NYC Is the Perfect Starting Market

**Why NYC first:**
- 8.3M residents | 60M+ annual visitors
- Highest density of nightly events of any US city
- Early adopter culture — ideal for product iteration
- Architecture is geo-based and transfers directly to Chicago, LA, SF

**Market size:**
| Level | Size |
|---|---|
| TAM — Global live events software/discovery | ~$3–5B |
| SAM — US local events discovery | ~$800M–$1.2B |
| SOM — NYC-first, years 1–3 | $5–15M ARR |

**Comp:** Bandsintown monetizes at ~$0.30–0.80/MAU. At 500K NYC MAUs: $150K–$400K/month before geographic expansion.

---

## SLIDE 7 — Competitive Landscape

# Why Existing Tools Fall Short

| | NowGo | Google Events | Eventbrite | Fever | Bandsintown |
|---|---|---|---|---|---|
| Multi-source aggregation | ✅ | Partial | ✗ | ✗ | Music only |
| Real-time tonight focus | ✅ | ✗ | ✗ | Partial | ✗ |
| Travel-time ("leave by") | ✅ | ✗ | ✗ | ✗ | ✗ |
| Free events included | ✅ | ✗ | Partial | ✗ | ✗ |
| Price comparison | ✅ | ✗ | ✗ | ✗ | ✗ |
| Serendipity engine | ✅ | ✗ | ✗ | ✗ | ✗ |

**The gap NowGo fills:** Nobody combines real-time aggregation + travel-time awareness + free events + price transparency in a single mobile experience.

---

## SLIDE 8 — Revenue Model

# Three Revenue Layers

**Phase 1 — Affiliate commissions** *(launch)*
Earn 1–3% on ticket purchases completed through NowGo links. Ticketmaster and SeatGeek both run affiliate programs.
*Status: an early application was declined before any prototype existed and has not been retried. Both programs onboard individual publishers, so this is a re-application rather than a blocker — but it is not yet secured, and should not be presented as in hand.*

**Phase 2 — Promoted listings** *(6–12 months)*
Local venues and promoters pay to surface events to relevant users at the right moment. "You're 8 minutes away, show starts in 45." High intent = high CPM.

**Phase 3 — B2B API** *(12–24 months)*
License the tonight-feed + travel-time layer to hotels, concierge apps, tourism platforms, and transit apps (Citymapper, Transit). White-label "What's happening near you tonight" as a service.

**Long-term — NowGo Pass** *(post-PMF)*
Premium subscription: curated weekly picks, seat alerts when sold-out events open up, priority push notifications.

---

## SLIDE 9 — Roadmap

# Path to Series A

```
NOW                Q3 2026              Q4 2026              Q1–Q2 2027
 │                    │                    │                    │
 ▼                    ▼                    ▼                    ▼
Data layer        Mobile MVP           500–1K users         Pre-seed raise
complete    ──▶   + travel time  ──▶   D30 retention  ──▶  + 3 cities
                  + surprise          data in hand         Series A ready
                  score live
```

**Series A readiness checklist:**
- [ ] DAU/MAU ratio > 20%
- [ ] D30 retention curve flattening (not dropping to zero)
- [ ] CAC:LTV ratio > 3:1
- [ ] Revenue model proven at small scale
- [ ] Playbook replicating in 1–2 cities beyond NYC

---

## SLIDE 10 — The Ask

# Pre-Seed Round

**Raising:** $500K – $1.5M

**Use of funds:**

| Allocation | % | What it buys |
|---|---|---|
| Engineering | 60% | Mobile app, travel time engine, surprise score, API server |
| User acquisition | 25% | NYC-first: content, creators, ASO |
| Operations | 15% | Infrastructure, legal, tools |

**What we'll prove with this round:**
1. A working mobile app with the "leave by" experience live
2. 500–1,000 real recurring NYC users
3. D7 and D30 retention data showing habitual use
4. At least one revenue channel generating real dollars

**Investor profile we're looking for:**
- NYC-connected angels with consumer app or events experience
- Funds with local/entertainment portfolio (Lerer Hippeau, Betaworks, RRE Ventures)
- Strategic angels: venue operators, transit app founders, hospitality tech

---

## SLIDE 11 — Why Now

# Three Tailwinds

**1. Post-pandemic behavior shift**
NYC nights are busier than pre-2020. Spontaneous, experience-first spending is up. The "what should I do?" question is asked more often than ever.

**2. API ecosystems are mature**
Ticketmaster, SeatGeek, and NYC Open Data have stable, documented APIs. Three years ago this data wasn't accessible at this quality.

**3. Real-time geo infrastructure is cheap**
Indexed lat/lng and a bounding-box filter handle "near me" on ordinary Postgres. Google Maps Distance Matrix is pay-per-call. What would have required a geo engineering team in 2018 is now table stakes infrastructure.

---

## APPENDIX — Key Metrics to Track from Day One

| Metric | Target (Month 6) | Why It Matters |
|---|---|---|
| DAU / MAU ratio | > 20% | Habitual use signal |
| D7 retention | > 30% | Early product stickiness |
| D30 retention | > 15% | Sustainable growth possible |
| Session depth (events viewed) | > 5 per session | Discovery value is working |
| Affiliate conversion rate | > 2% | Revenue model viability |
| CAC (paid) | < $6 | Unit economics floor |

---

*NowGo | Pre-Seed 2026 | Confidential — Not for Distribution*
*Contact: dbolen@cfr.org*

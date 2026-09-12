---
title: Beta invite email campaign
---

# NowGo beta invite — Loops campaign

Copy to paste into Loops. Written as Donnie, not "the team." Two sends plus the
welcome email the landing page form now promises.

Audience: the nowgoapp.com waitlist (Loops form `cmp31armp01hx0iy8v5vfkqds`).
Link everywhere: `https://testflight.apple.com/join/kMKDNEkK`

---

## Email 1 — the invite

Send: day 0, whole list.

**Subject options** (pick one; A is the recommendation)

- A: `NowGo is open. Here's your TestFlight link.`
- B: `You asked for early access. It's ready.`
- C: `What's on in NYC tonight — the beta is live`

**Preheader:** `iPhone only, NYC only, free. Takes about a minute to install.`

**Body**

> Hi —
>
> A while back you put your email on nowgoapp.com and asked to hear when NowGo
> was ready. It is. The iOS beta is open on TestFlight.
>
> **[Join the beta on TestFlight →](https://testflight.apple.com/join/kMKDNEkK)**
>
> NowGo does one thing: it shows you what's on in New York tonight — concerts,
> jazz, comedy, sports — tells you when you need to leave from wherever you're
> standing, and flags the rooms you can just walk into.
>
> Three things to try the first night:
>
> 1. Open it around 6pm with no plan. See if it gets you somewhere.
> 2. Tap **Surprise Me**. It hands you one thing starting in the next 30–90
>    minutes that you can still make.
> 3. Find a jazz club and read what it says about walking in. We pulled that
>    from each venue's own site (and called Birdland to be sure).
>
> It's a beta. It's NYC only and iPhone only, and the listings are only as good
> as the sources feeding them. When something's wrong — a leave-by that made you
> late, a venue that wasn't walk-in, a blank screen — just reply to this email.
> I read every one.
>
> — Donnie
> NowGo · New York City
>
> <small>Installing: tap the link on your iPhone. If you don't have TestFlight
> yet, the App Store will ask you to grab it first (free). Then come back to the
> link.</small>

---

## Email 2 — the reminder

Send: day 5, to anyone who **did not click** the TestFlight link in Email 1.
(Loops: filter the audience on "Email 1 → link not clicked".)

**Subject:** `Still here if you want it`

**Preheader:** `One tap to install. Then open it tonight.`

**Body**

> Hi —
>
> Quick one. Last week I sent the TestFlight link for the NowGo beta and it
> looks like it didn't get opened. No problem — it's still here:
>
> **[Join the beta on TestFlight →](https://testflight.apple.com/join/kMKDNEkK)**
>
> The whole pitch is: open the app on a night you have no plan, and it tells you
> what's on in the city right now, when to leave, and where you can walk in
> without a ticket.
>
> If you'd rather not test a beta, no hard feelings — hit unsubscribe below and
> I'll ping you when it's on the App Store instead.
>
> — Donnie

---

## Welcome email — triggered by the landing page form

The landing page now says "Get the link by email" and its success message reads
"Check your inbox for the TestFlight link." **That promise only holds if Loops
sends this automatically on signup.** Set it up as a Loops *Loop* (automation)
triggered by "contact added via form `cmp31armp…`", or as the form's welcome
email.

**Subject:** `Your NowGo TestFlight link`

**Preheader:** `Open this on your iPhone.`

**Body**

> Here's the link you asked for:
>
> **[Join the NowGo beta on TestFlight →](https://testflight.apple.com/join/kMKDNEkK)**
>
> Open it on your iPhone. If you don't have TestFlight installed, the App Store
> will prompt you first — it's free, then come back to the link.
>
> NowGo shows what's on in New York tonight, when to leave, and which rooms let
> you walk in. It's a beta, so when something's off, reply to this email and
> tell me.
>
> — Donnie

---

## Loops checklist

- [ ] Welcome email above is live on the form before the landing page deploys
      (otherwise the form's success message is a lie).
- [ ] Email 1 scheduled; TestFlight link tracked so Email 2's audience filter works.
- [ ] Email 2 scheduled for day 5, audience = "did not click" Email 1.
- [ ] Reply-to is `hello@nowgoapp.com` (forwards to Gmail via Cloudflare).
- [ ] After sending: check App Store Connect → TestFlight → Friends and Family
      tester count moves. Note that Beta App Review must have passed for build 9
      on the *external* group — the internal group doesn't count.

import { WALK_IN_POLICIES } from "../services/walk-in.js";

// Venue names and websites come from third-party feeds and are not trusted
// input. Everything interpolated below goes through this first.
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only http(s) links are rendered as links. A venue website is stored as
// whatever Google Place Details returned, and a `javascript:` value there
// would otherwise become a live link on this page.
export function safeHref(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function formatNextEvent(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderRow(venue) {
  const href = safeHref(venue.website);
  const site = href
    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        new URL(href).hostname.replace(/^www\./, "")
      )}</a>`
    : `<span class="muted">no site</span>`;

  return `<tr>
    <td class="count">${venue.events}</td>
    <td class="name">${escapeHtml(venue.name)}</td>
    <td class="muted">${escapeHtml(venue.neighborhood || "—")}</td>
    <td class="muted nowrap">${escapeHtml(formatNextEvent(venue.next_event))}</td>
    <td>${site}</td>
    <td class="muted">${escapeHtml(venue.sources || "—")}</td>
  </tr>`;
}

export function renderUncuratedVenuesPage(venues, { generatedAt = new Date() } = {}) {
  const totalEvents = venues.reduce((sum, v) => sum + Number(v.events), 0);

  const body = venues.length
    ? `<table>
        <thead>
          <tr>
            <th>Events</th><th>Venue</th><th>Neighborhood</th>
            <th>Next event</th><th>Website</th><th>Source</th>
          </tr>
        </thead>
        <tbody>${venues.map(renderRow).join("")}</tbody>
      </table>`
    : `<p class="done">Every venue with upcoming events has a walk-in policy.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>NowGo — venues needing a walk-in decision</title>
<style>
  :root {
    --bg: #ffffff; --fg: #16181d; --muted: #6b7280;
    --line: #e5e7eb; --accent: #b45309; --card: #f9fafb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1115; --fg: #e8eaed; --muted: #9aa0aa;
      --line: #262a33; --accent: #f0b429; --card: #171a21;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 1.5rem 1rem 4rem;
    background: var(--bg); color: var(--fg);
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  main { max-width: 60rem; margin: 0 auto; }
  h1 { font-size: 1.35rem; margin: 0 0 .25rem; }
  .sub { color: var(--muted); margin: 0 0 1.5rem; font-size: .9rem; }
  .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; }
  th, td { text-align: left; padding: .55rem .6rem; border-bottom: 1px solid var(--line); }
  th { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; }
  tbody tr:hover { background: var(--card); }
  .count { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--accent); width: 3.5rem; }
  .name { font-weight: 600; }
  .muted { color: var(--muted); }
  .nowrap { white-space: nowrap; }
  a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .done { padding: 1.25rem; background: var(--card); border-radius: .5rem; }
  .key { margin-top: 2rem; padding: 1rem 1.25rem; background: var(--card); border-radius: .5rem; font-size: .85rem; }
  .key h2 { font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 .6rem; }
  .key dl { display: grid; grid-template-columns: auto 1fr; gap: .3rem .9rem; margin: 0; }
  .key dt { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--accent); }
  .key dd { margin: 0; color: var(--muted); }
  .key code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; }
  footer { margin-top: 2rem; color: var(--muted); font-size: .8rem; }
</style>
</head>
<body>
<main>
  <h1>${venues.length} venue${venues.length === 1 ? "" : "s"} need a walk-in decision</h1>
  <p class="sub">
    ${totalEvents} upcoming event${totalEvents === 1 ? "" : "s"} sit behind these.
    Until a venue is curated it never appears in the walk-ins filter.
    Biggest impact first.
  </p>

  <div class="scroll">${body}</div>

  <div class="key">
    <h2>Setting a policy</h2>
    <dl>
      <dt>always</dt><dd>No advance option — you just show up</dd>
      <dt>space_permitting</dt><dd>Advance tickets exist, walk-ins admitted if there is room</dd>
      <dt>standby</dt><dd>Walk-ins queue with no guarantee</dd>
      <dt>none</dt><dd>Advance purchase genuinely required</dd>
      <dt>unknown</dt><dd>Not yet decided — what everything here is now</dd>
    </dl>
    <p style="margin:.9rem 0 0">
      <code>always</code> and <code>space_permitting</code> are the two that reach the filter.
      Leave a venue <code>unknown</code> rather than guessing.
    </p>
  </div>

  <footer>
    Generated ${escapeHtml(
      generatedAt.toLocaleString("en-US", {
        timeZone: "America/New_York",
        dateStyle: "medium",
        timeStyle: "short",
      })
    )} ET · refreshes on load · <a href="?format=json">JSON</a>
  </footer>
</main>
</body>
</html>`;
}

// Exported so a test can assert the page's legend covers every policy the
// schema allows — a new policy value that never reaches this list would leave
// a curator guessing.
export const DOCUMENTED_POLICIES = WALK_IN_POLICIES;

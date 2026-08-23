import crypto from "node:crypto";

// POST /pipeline/run triggers every fetcher on demand, spending Ticketmaster,
// SeatGeek and Google Places quota each time. It took no credentials at all,
// so anyone who found the route could run up the bill on request.
//
// Fails CLOSED. With no PIPELINE_TOKEN configured the route refuses rather than
// falling back to open, because the failure being loud is the whole point —
// silently reverting to unauthenticated is the bug we are fixing.
//
// The scheduler in src/scheduler.js calls runPipeline() in process and never
// goes through HTTP, so gating this route cannot stop scheduled ingestion.

// Compare via fixed-length digests: timingSafeEqual throws on length mismatch,
// and the length of the supplied token should not itself be an oracle.
function tokensMatch(supplied, expected) {
  const a = crypto.createHash("sha256").update(String(supplied)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

export function checkPipelineToken(authorizationHeader, expectedToken) {
  if (!expectedToken) {
    return {
      ok: false,
      status: 503,
      error:
        "Pipeline trigger is not configured. Set PIPELINE_TOKEN on the server to enable it.",
    };
  }

  const header = typeof authorizationHeader === "string" ? authorizationHeader : "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    return { ok: false, status: 401, error: "Missing or malformed Authorization header" };
  }

  // One message for absent and for wrong, so a caller learns nothing from the
  // difference between a token that does not exist and one that is incorrect.
  if (!tokensMatch(match[1], expectedToken)) {
    return { ok: false, status: 401, error: "Missing or malformed Authorization header" };
  }

  return { ok: true };
}

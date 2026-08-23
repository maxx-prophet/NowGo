import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPipelineToken } from "./pipeline-auth.js";

const TOKEN = "s3cret-pipeline-token";

test("a correct bearer token is accepted", () => {
  assert.deepEqual(checkPipelineToken(`Bearer ${TOKEN}`, TOKEN), { ok: true });
});

// The whole point of the fix. If a missing server token fell back to open,
// forgetting to set the env var would silently restore the vulnerability.
test("an unconfigured server refuses rather than falling back to open", () => {
  for (const missing of [undefined, null, ""]) {
    const r = checkPipelineToken(`Bearer ${TOKEN}`, missing);
    assert.equal(r.ok, false);
    assert.equal(r.status, 503);
    assert.match(r.error, /PIPELINE_TOKEN/);
  }
});

test("no Authorization header is rejected", () => {
  const r = checkPipelineToken(undefined, TOKEN);
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test("a non-Bearer scheme is rejected", () => {
  assert.equal(checkPipelineToken(`Basic ${TOKEN}`, TOKEN).ok, false);
  assert.equal(checkPipelineToken(TOKEN, TOKEN).ok, false);
});

test("a wrong token is rejected", () => {
  assert.equal(checkPipelineToken("Bearer nope", TOKEN).ok, false);
});

// A near-miss must not be treated as a match — guards against any future
// switch to a prefix or startsWith comparison.
test("a token that is a prefix of the real one is rejected", () => {
  assert.equal(checkPipelineToken(`Bearer ${TOKEN.slice(0, -1)}`, TOKEN).ok, false);
  assert.equal(checkPipelineToken(`Bearer ${TOKEN}x`, TOKEN).ok, false);
});

// Distinguishing "wrong token" from "no token" would tell a caller whether
// they had guessed the scheme correctly.
test("wrong and malformed produce the same message", () => {
  const wrong = checkPipelineToken("Bearer nope", TOKEN);
  const malformed = checkPipelineToken("", TOKEN);
  assert.equal(wrong.error, malformed.error);
  assert.equal(wrong.status, malformed.status);
});

test("comparison does not throw on tokens of differing length", () => {
  // timingSafeEqual throws on length mismatch, so the digests must be hashed
  // to a fixed width first.
  assert.doesNotThrow(() => checkPipelineToken("Bearer a", TOKEN));
  assert.doesNotThrow(() => checkPipelineToken(`Bearer ${"x".repeat(5000)}`, TOKEN));
});

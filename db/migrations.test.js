import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { venueAliasKey } from "./ingest.js";

const MIGRATIONS_DIR = join(import.meta.dirname, "migrations");

function readMigration(nameFragment) {
  const file = readdirSync(MIGRATIONS_DIR).find((f) => f.includes(nameFragment));
  assert.ok(file, `no migration matching '${nameFragment}'`);
  // Strip comment lines — they contain illustrative SQL that is not executed.
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8").replace(/^\s*--.*$/gm, "");
}

const mergeSql = readMigration("merge_duplicate");

// Each merge block names a canonical and a duplicate venue in its repoint
// UPDATE, then inserts an alias keyed off the duplicate's name.
const repoints = [
  ...mergeSql.matchAll(
    /UPDATE events[\s\S]*?c\.name\s*=\s*'([^']+)'\s*AND\s*d\.name\s*=\s*'([^']+)'/g
  ),
].map(([, canonical, duplicate]) => ({ canonical, duplicate }));

const aliasInserts = [
  ...mergeSql.matchAll(
    /INSERT INTO venue_aliases[\s\S]*?SELECT\s*'([^']+)'[\s\S]*?WHERE name\s*=\s*'([^']+)'/g
  ),
].map(([, alias, canonical]) => ({ alias, canonical }));

test("venueAliasKey strips non-alphanumerics rather than folding accents", () => {
  assert.equal(venueAliasKey("Django(The)"), "djangothe");
  assert.equal(venueAliasKey("The Jazz Gallery"), "thejazzgallery");
  // Documents the accent behaviour so a future change to fold instead of strip
  // has to update this deliberately — existing alias rows depend on it.
  assert.equal(venueAliasKey("Bar Lunàtico"), "barluntico");
  assert.equal(venueAliasKey(null), "");
});

test("the merge migration actually contains merge blocks", () => {
  // A regex that silently matched nothing would make the tests below vacuous.
  assert.ok(repoints.length >= 4, `only found ${repoints.length} repoints`);
  assert.equal(aliasInserts.length, repoints.length);
});

test("every seeded alias key is one ingest would actually produce", () => {
  // resolveVenueAlias() looks up venueAliasKey(incomingName). A hand-written
  // key that differs by so much as a stripped character never matches, and the
  // duplicate venue row silently comes back on the next ingest.
  for (const { canonical, duplicate } of repoints) {
    const insert = aliasInserts.find((a) => a.canonical === canonical);
    assert.ok(insert, `no alias insert for canonical '${canonical}'`);
    assert.equal(
      insert.alias,
      venueAliasKey(duplicate),
      `alias for '${duplicate}' should be '${venueAliasKey(duplicate)}'`
    );
  }
});

test("an alias never points a venue at itself", () => {
  for (const { canonical, duplicate } of repoints) {
    assert.notEqual(
      venueAliasKey(canonical),
      venueAliasKey(duplicate),
      `'${canonical}' and '${duplicate}' collapse to the same alias key`
    );
  }
});

test("every venue delete is guarded on having no events left", () => {
  // events.venue_id is ON DELETE NO ACTION, so an unguarded delete would error
  // rather than cascade — but the guard is what makes a failed repoint a no-op
  // instead of a migration that aborts the whole deploy.
  const deletes = [...mergeSql.matchAll(/DELETE FROM venues[\s\S]*?;/g)].map((m) => m[0]);
  assert.ok(deletes.length >= 4, `only found ${deletes.length} deletes`);
  for (const stmt of deletes) {
    assert.match(
      stmt,
      /NOT EXISTS\s*\(\s*SELECT 1 FROM events e WHERE e\.venue_id = d\.venue_id\s*\)/,
      `unguarded venue delete:\n${stmt}`
    );
  }
});

test("every alias insert tolerates being re-run", () => {
  // db/migrate.js re-runs every migration on every run.
  const inserts = [...mergeSql.matchAll(/INSERT INTO venue_aliases[\s\S]*?;/g)].map((m) => m[0]);
  assert.ok(inserts.length >= 4);
  for (const stmt of inserts) {
    assert.match(stmt, /ON CONFLICT \(alias\) DO NOTHING/, `unguarded insert:\n${stmt}`);
  }
});

test("events are repointed before the duplicate venue is deleted", () => {
  // Order matters: deleting first would strand the events on a missing venue
  // (or abort the migration). Assert per duplicate rather than globally.
  for (const { duplicate } of repoints) {
    const updateAt = mergeSql.indexOf(`d.name = '${duplicate}'`);
    const deleteAt = mergeSql.indexOf(`DELETE FROM venues d WHERE d.name = '${duplicate}'`);
    assert.ok(updateAt !== -1 && deleteAt !== -1, `blocks missing for '${duplicate}'`);
    assert.ok(updateAt < deleteAt, `'${duplicate}' is deleted before its events move`);
  }
});

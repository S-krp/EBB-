import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readFeed, saveBoard, updateCachedNotice } from "../lib/db";
import { normalize } from "../lib/normalize";

test("uses POSTGRES_URL on Vercel when DATABASE_URL is empty", async () => {
  const env = process.env;
  process.env = { ...env, VERCEL: "1", DATABASE_URL: "", POSTGRES_URL: "postgres://[" };
  try {
    await assert.rejects(readFeed(), { code: "ERR_INVALID_URL" });
  } finally {
    process.env = env;
  }
});

test("refreshes cached derived fields even when the hash matches", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ebb-db-"));
  process.env.SQLITE_PATH = join(dir, "notices.sqlite");
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const postedAt = "2026-11-25T00:00:00.000Z";
  const status = { board: "LINK" as const, lastAttempt: postedAt, lastSuccess: postedAt, error: null, count: 1 };
  const refreshed = normalize({
    board: "LINK", pipeline: "Algonquin Gas Transmission", id: "1", title: "Operational Flow Order",
    sourceType: "Capacity Constraint", critical: true, postedAt, effectiveFrom: postedAt, effectiveThrough: null,
    sourceUrl: "https://example.org/notices/1", body: "Imbalance tolerance is 5%.",
  });
  const stale = {
    ...refreshed, category: "Non-Critical" as const, critical: false, emergency: true,
    tolerances: [], effectiveFrom: null, effectiveThrough: postedAt,
  };

  await saveBoard([stale], status);
  await saveBoard([refreshed], status);
  assert.deepEqual((await readFeed()).notices, [refreshed]);

  await saveBoard([stale], status);
  assert.equal(await updateCachedNotice("older-hash", refreshed), false);
  assert.equal(await updateCachedNotice(stale.hash, refreshed), true);
  assert.deepEqual((await readFeed()).notices, [refreshed]);
  assert.equal(await updateCachedNotice(refreshed.hash, refreshed), false);
});

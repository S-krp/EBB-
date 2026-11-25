import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readFeed, saveBoard } from "../lib/db";
import { normalize } from "../lib/normalize";

test("a clean Transwestern sweep keeps recent stored notices and only prunes ones past retention", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ebb-retention-"));
  process.env.SQLITE_PATH = join(dir, "notices.sqlite");
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const notice = (id: string, critical: boolean, postedAt: string, effectiveThrough: string | null) => normalize({
    board: "TW", pipeline: "Transwestern", id, title: `Notice ${id}`, sourceType: "Other", critical,
    postedAt, effectiveFrom: postedAt, effectiveThrough, sourceUrl: `https://example.org/${id}`, body: "Body",
  });
  const recentCritical = notice("1", true, "2026-11-24T12:00:00.000Z", null);
  const expired = notice("2", false, "2026-07-01T12:00:00.000Z", "2026-07-15T12:00:00.000Z");
  const current = notice("3", false, "2026-11-25T12:00:00.000Z", null);
  const status = (count: number) => {
    const at = "2026-11-25T15:05:00.000Z";
    return { board: "TW" as const, lastAttempt: at, lastSuccess: at, error: null, count };
  };
  const ids = async () => (await readFeed()).notices.map((stored) => stored.id).sort();

  await saveBoard([recentCritical, expired, current], status(3));
  await saveBoard([current], status(1));
  assert.deepEqual(await ids(), ["1", "3"]);

  await saveBoard([], status(0));
  assert.deepEqual(await ids(), ["1", "3"]);
});

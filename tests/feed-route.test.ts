import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { GET } from "../app/api/feed/route";
import { GET as getNotice } from "../app/api/notices/[board]/[id]/route";
import { readFeed, saveBoard } from "../lib/db";
import type { Snapshot } from "../lib/model";
import { normalize } from "../lib/normalize";

const dir = mkdtempSync(join(tmpdir(), "ebb-feed-"));
process.env.SQLITE_PATH = join(dir, "notices.sqlite");
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
after(() => rmSync(dir, { recursive: true, force: true }));

const lastAttempt = "2026-11-25T00:00:00.000Z";
const status = { board: "EPNG" as const, lastAttempt, lastSuccess: lastAttempt, error: null, count: 2 };
const notice = (id: string, title: string, postedAt = lastAttempt, effectiveThrough: string | null = null) => normalize({
  board: "EPNG", pipeline: "El Paso Natural Gas", id, title, sourceType: "", critical: false, postedAt,
  effectiveFrom: postedAt, effectiveThrough, sourceUrl: `https://example.org/${id}`, body: "",
});
const get = (query = "", etag?: string) =>
  GET(new Request(`http://localhost/api/feed${query}`, { headers: etag ? { "If-None-Match": etag } : {} }));

test("the feed answers unchanged polls with 304 and filters by board and category", async () => {
  await saveBoard([notice("1", "Operational Flow Order"), notice("2", "Planned maintenance")], status);

  const first = await get();
  const etag = first.headers.get("etag")!;
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-cache");
  assert.equal(((await first.json()) as Snapshot).notices.length, 2);

  const unchanged = await get("", `W/${etag}`);
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), "");

  const ofo = await get("?category=OFO");
  assert.notEqual(ofo.headers.get("etag"), etag);
  assert.deepEqual(((await ofo.json()) as Snapshot).notices.map(({ id }) => id), ["1"]);
  assert.deepEqual(((await (await get("?board=TW")).json()) as Snapshot).notices, []);

  await saveBoard([notice("1", "Operational Flow Order lifted"), notice("2", "Planned maintenance")], status);
  const changed = await get("", etag);
  assert.equal(changed.status, 200);
  assert.equal(((await changed.json()) as Snapshot).notices.find(({ id }) => id === "1")?.title, "Operational Flow Order lifted");
});

test("successful sweeps prune notices that left the board and ended more than 90 days ago", async () => {
  const old = "2026-07-01T00:00:00.000Z";
  await saveBoard([
    notice("3", "Old maintenance", old, old), notice("4", "Old open-ended notice", old),
    notice("5", "Old but ongoing", old, "2026-12-31T00:00:00.000Z"), { ...notice("7", "Undated notice"), postedAt: null, effectiveFrom: null },
  ], status);
  await saveBoard([notice("6", "Current notice")], { ...status, error: "Partial board failure", lastSuccess: null });
  assert.deepEqual((await readFeed()).notices.map(({ id }) => id).sort(), ["1", "2", "3", "4", "5", "6", "7"]);

  await saveBoard([notice("6", "Current notice")], status);
  assert.deepEqual((await readFeed()).notices.map(({ id }) => id).sort(), ["1", "2", "4", "5", "6", "7"]);
});

test("loads table blocks only for the selected notice, not the polling feed", async () => {
  const bodyBlocks = [{ type: "table" as const, rows: [[{ text: "301839", header: false, colSpan: 1, rowSpan: 1 }]] }];
  const formatted = normalize({ ...notice("8", "Location Performance Update"), bodyBlocks });
  await saveBoard([formatted], status);
  const feed = await (await get()).json() as Snapshot;
  assert.equal("bodyBlocks" in feed.notices.find(({ id }) => id === "8")!, false);
  const detail = (pipeline: string, board = "EPNG", id = "8") => getNotice(
    new Request(`http://localhost/api/notices/${board}/${id}?${new URLSearchParams({ pipeline })}`),
    { params: Promise.resolve({ board, id }) },
  );
  assert.deepEqual(await (await detail(formatted.pipeline)).json(), { bodyBlocks });
  assert.deepEqual(await (await detail(formatted.pipeline, "EPNG", "6")).json(), { bodyBlocks: null });
  assert.equal((await detail("Other pipeline")).status, 404);
  assert.equal((await detail(formatted.pipeline, "TW")).status, 404);
  assert.equal((await detail(formatted.pipeline, "invalid")).status, 400);
});

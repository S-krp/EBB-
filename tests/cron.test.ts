import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GET } from "../app/api/cron/route";
import { claimSweep, recordScheduledSweep, releaseSweep, scheduledSweepCompleted } from "../lib/db";

test("cron rejects unauthorized calls and skips both completed slots and off-hours", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ebb-cron-"));
  process.env.SQLITE_PATH = join(dir, "notices.sqlite");
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  process.env.CRON_SECRET = "test-secret";
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-25T04:07:00Z") });

  const url = "http://localhost/api/cron";
  const request = new Request(url, { headers: { Authorization: "Bearer test-secret" } });
  assert.equal((await GET(new Request(url))).status, 401);

  const slot = "2026-11-25T04:00:00.000Z";
  assert.equal(await scheduledSweepCompleted(slot), false);
  await recordScheduledSweep(slot);
  assert.deepEqual(await (await GET(request)).json(), { skipped: "A sweep is already running or completed this hour." });
  assert.equal(await claimSweep("next-owner"), true);
  await releaseSweep("next-owner");
  assert.equal(await scheduledSweepCompleted("2026-11-25T15:00:00.000Z"), false);

  t.mock.timers.tick(60 * 60_000);
  assert.deepEqual(await (await GET(request)).json(), { skipped: "Outside the scheduled Central hour." });
});

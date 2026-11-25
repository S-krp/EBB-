import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { POST } from "../app/api/sweep/route";
import { claimSweep, recordSweepFinish, releaseSweep, sweepCooldownSeconds } from "../lib/db";

test("prevents immediate anonymous re-sweeps and exposes Retry-After", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ebb-sweep-"));
  process.env.SQLITE_PATH = join(dir, "notices.sqlite");
  delete process.env.DATABASE_URL;
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-25T00:02:24.650Z") });
  const request = new Request("http://localhost/api/sweep", { method: "POST" });
  assert.equal(await claimSweep("recent-run"), true);
  assert.equal((await POST(request)).status, 409);
  await recordSweepFinish();
  await releaseSweep("recent-run");

  t.mock.timers.tick(20_000);
  const response = await POST(request);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "280");
  assert.match((await response.json()).error, /wait 280 seconds/);

  assert.equal(await claimSweep("scheduled-run"), true);
  await releaseSweep("scheduled-run");
  t.mock.timers.tick(280_000);
  assert.equal(await sweepCooldownSeconds(), 0);
});

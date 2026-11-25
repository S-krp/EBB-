import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
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

test("cron accepts only signed, unexpired GitHub OIDC tokens for this audience and main branch", async (t) => {
  const secret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  t.after(() => {
    if (secret !== undefined) process.env.CRON_SECRET = secret;
  });
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-25T05:07:00Z") });

  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const wrongKey = (await generateKeyPair("RS256")).privateKey;
  const kid = "github-test-key";
  const jwk = { ...await exportJWK(publicKey), kid, alg: "RS256" };
  const issuer = "https://token.actions.githubusercontent.com";
  const audience = "https://ebb-watch.vercel.app";
  const fetchKeys = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    assert.equal(String(input), `${issuer}/.well-known/jwks`);
    return Response.json({ keys: [jwk] });
  });
  const claims = {
    iss: issuer,
    aud: audience,
    repository: "S-krp/EBB-",
    ref: "refs/heads/main",
    exp: Date.now() / 1000 + 300,
  };
  async function send(payload: JWTPayload, key = privateKey) {
    const token = await new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid }).sign(key);
    return GET(new Request("http://localhost/api/cron", { headers: { Authorization: `Bearer ${token}` } }));
  }
  const accepted = await send(claims);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { skipped: "Outside the scheduled Central hour." });
  assert.equal(fetchKeys.mock.callCount(), 1);

  for (const [claim, value] of [
    ["iss", "https://issuer.example"],
    ["aud", "https://other.example"],
    ["repository", "someone/EBB-"],
    ["ref", "refs/heads/feature"],
    ["exp", Date.now() / 1000 - 1],
    ["exp", undefined],
  ] as const) {
    assert.equal((await send({ ...claims, [claim]: value })).status, 401, claim);
  }
  assert.equal((await send(claims, wrongKey)).status, 401);
});

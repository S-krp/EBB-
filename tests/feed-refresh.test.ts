import assert from "node:assert/strict";
import { test } from "node:test";
import { createFeedRefresh } from "../lib/feed-refresh";
import type { Snapshot } from "../lib/model";

test("a delayed poll cannot overwrite a newer feed snapshot or show an obsolete error", async (t) => {
  const delayedSuccess = Promise.withResolvers<Response>();
  const delayedError = Promise.withResolvers<Response>();
  const current = { status: [], notices: [], nextSweep: "2027-03-14T23:00:00.000Z" } satisfies Snapshot;
  const responses = [delayedSuccess.promise, delayedError.promise, Promise.resolve(Response.json(current))];
  t.mock.method(globalThis, "fetch", () => responses.shift());

  const setSnapshot = t.mock.fn<(snapshot: Snapshot) => void>();
  const setFeedError = t.mock.fn<(error: string) => void>();
  const refresh = createFeedRefresh(setSnapshot, setFeedError);
  const firstPoll = refresh();
  const secondPoll = refresh();
  await refresh();
  delayedSuccess.resolve(Response.json({ ...current, nextSweep: "2027-03-14T18:00:00.000Z" }));
  delayedError.reject(new Error("offline"));
  await Promise.all([firstPoll, secondPoll]);

  assert.deepEqual(setSnapshot.mock.calls.map(({ arguments: args }) => args), [[current]]);
  assert.deepEqual(setFeedError.mock.calls.map(({ arguments: args }) => args), [[""]]);
});

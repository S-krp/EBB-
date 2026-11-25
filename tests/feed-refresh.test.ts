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

test("an unchanged ETag keeps the current snapshot without parsing the body again", async (t) => {
  const current = { status: [], notices: [], nextSweep: "2027-03-14T23:00:00.000Z" } satisfies Snapshot;
  const headers = { ETag: '"r1"' };
  const responses = [Response.json(current, { headers }), new Response("not json", { headers })];
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
    requests.push(init);
    return Promise.resolve(responses.shift());
  });

  const setSnapshot = t.mock.fn<(snapshot: Snapshot) => void>();
  const setFeedError = t.mock.fn<(error: string) => void>();
  const refresh = createFeedRefresh(setSnapshot, setFeedError);
  await refresh();
  await refresh();

  assert.deepEqual(requests.map(({ cache }) => cache), ["no-cache", "no-cache"]);
  assert.deepEqual(setSnapshot.mock.calls.map(({ arguments: args }) => args), [[current]]);
  assert.deepEqual(setFeedError.mock.calls.map(({ arguments: args }) => args), [[""], [""]]);
});

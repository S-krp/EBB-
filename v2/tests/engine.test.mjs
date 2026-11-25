import assert from "node:assert/strict";
import test from "node:test";
import { alertTracker } from "../lib/alerts.mjs";
import { cycleClock } from "../lib/cycles.mjs";
import { readCapacity, readNotices } from "../lib/feeds.mjs";
import { memoryGraph, seedGraph, withCapacity } from "../lib/graph.mjs";
import { graphStore } from "../lib/neo4j.mjs";
import { solve } from "../lib/solver.mjs";

const now = Date.parse("2026-07-20T18:00:00Z");
const iso = (time) => new Date(time).toISOString();
const sourceUrl = "https://example.com/board";
const jsonFeed = (data) => async () => Response.json(data);
const input = { origin: "delaware", supplyPrice: 2.25, demand: 35000, markets: { katy: 3.1, hsc: 3.35 } };

test("graph backends default to isolated illustrative snapshots", async () => {
  const store = graphStore({});
  const graph = await store.read();
  assert.equal(store.name, "In-memory");
  assert.deepEqual(graph, seedGraph);
  assert.deepEqual(new Set(graph.nodes.map(({ kind }) => kind)), new Set(["receipt", "interconnect", "delivery", "storage"]));
  graph.edges[0].capacity = 1;
  assert.equal((await store.read()).edges[0].capacity, 100000);
  assert.throws(() => memoryGraph({ ...graph, nodes: [] }), /Invalid corridor segment/);
  assert.throws(() => graphStore({ NEO4J_URI: "neo4j://localhost" }), /credentials/);
});

test("fuel and tariffs are charged on grossed-up inlet volume", () => {
  const graph = {
    nodes: [{ id: "a", kind: "receipt" }, { id: "b", kind: "interconnect" }, { id: "c", kind: "delivery" }],
    edges: [
      { id: "ab", from: "a", to: "b", fuel: 0.2, tariff: 1, capacity: 125 },
      { id: "bc", from: "b", to: "c", fuel: 0.2, tariff: 2, capacity: 100 },
      { id: "back", from: "b", to: "a", fuel: 0, tariff: 0, capacity: 999 },
    ],
  };
  const result = solve(graph, { origin: "a", demand: 80, supplyPrice: 3, markets: { c: 12 } });
  assert.equal(result.routes.length, 1);
  assert.deepEqual(result.cheapest.segments.map(({ required }) => required), [125, 100]);
  assert.equal(result.cheapest.deliveredCost, 8.75);
  assert.equal(result.bestNetback.netback, 5.08);
  assert.equal(result.bestNetback.margin, 3.25);
});

test("constrained routes stay visible and cheapest differs from best netback", () => {
  const ofo = { board: "GCX", key: "GCX:1", title: "Imbalance OFO" };
  const result = solve(seedGraph, input, [ofo]);
  assert.equal(result.cheapest.destination, "katy");
  assert.equal(result.bestNetback.destination, "hsc");
  assert.deepEqual(result.bestNetback.segments.find(({ id }) => id === "gcx-agua").ofos, [ofo]);
  assert.ok(result.routes.some((route) => !route.feasible));
  const blocked = solve(seedGraph, { ...input, demand: 100000 });
  assert.equal(blocked.cheapest, null);
  assert.equal(blocked.bestNetback, null);
  assert.throws(() => solve(seedGraph, { ...input, demand: 0 }), /positive delivered volume/);
});

test("only fresh normalized OAC replaces illustrative capacity and can block a route", async () => {
  const capacity = await readCapacity({ OAC_FEED_URL: sourceUrl }, new Set(seedGraph.edges.map(({ id }) => id)), now,
    jsonFeed({ segments: [
      { edgeId: "gcx-agua", oac: 0, scheduledVolume: 100, asOf: iso(now), sourceUrl },
      { edgeId: "php-katy", oac: 0, asOf: iso(now - 13 * 3600000), sourceUrl },
    ] }));
  assert.equal(capacity.status, "partial");
  const graph = withCapacity(seedGraph, capacity.rows);
  assert.equal(graph.edges.find(({ id }) => id === "php-katy").capacitySource, "illustrative");
  const gcx = graph.edges.find(({ id }) => id === "gcx-agua");
  assert.equal(gcx.capacitySource, "reported");
  assert.equal(gcx.scheduledVolume, 100);
  const result = solve(graph, input);
  assert.equal(result.bestNetback.destination, "katy");
  assert.ok(result.routes.some((route) => route.segments.some(({ id, constrained }) => id === gcx.id && constrained)));
});

test("routing retains the newest reported capacity through replays and expires old observations", async () => {
  const tracker = alertTracker({ log: { info() {} } });
  const earlier = { edgeId: "gcx-agua", oac: 90000, asOf: iso(now - 2000), sourceUrl };
  const latest = { ...earlier, oac: 0, asOf: iso(now) };
  await tracker.observe([], [earlier], now - 2000);
  await tracker.observe([], [latest], now);
  const replayAt = now + 2000;
  const alerts = await tracker.observe([], [earlier], replayAt);
  assert.deepEqual(alerts.map(({ delta }) => delta), [-90000]);
  assert.deepEqual(tracker.capacityAt(replayAt), [latest]);
  const graph = withCapacity(seedGraph, tracker.capacityAt(replayAt));
  assert.equal(solve(graph, input).bestNetback.destination, "katy");
  assert.deepEqual(tracker.capacityAt(now + 12 * 3600000 + 1), []);
});

test("v1 feed reports partial coverage and keeps only relevant non-expired OFOs", async () => {
  const notice = { id: "1", board: "PHP", title: "OFO", category: "OFO", sourceUrl };
  const data = await readNotices({}, new Set(["PHP", "GCX"]), now, jsonFeed({
    status: [{ board: "PHP", lastSuccess: iso(now - 2000) }],
    notices: [
      { ...notice, effectiveFrom: iso(now + 3000) },
      { ...notice, id: "2", effectiveThrough: iso(now - 3000) },
      { ...notice, id: "3", board: "TW" },
      { ...notice, id: "4", category: "Maintenance" },
    ],
  }));
  assert.equal(data.status, "partial");
  assert.deepEqual(data.missed, ["GCX"]);
  assert.deepEqual(data.notices.map(({ key, upcoming }) => [key, upcoming]), [["PHP:1:OFO", true]]);
});

test("feed timestamps are checked against receipt time, not request time", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const next = iso(now + 1000);
  const capacity = await readCapacity({ OAC_FEED_URL: sourceUrl }, new Set(["php-katy"]), undefined, async () => {
    t.mock.timers.tick(1000);
    return Response.json({ segments: [{ edgeId: "php-katy", oac: 42, asOf: next, sourceUrl }] });
  });
  assert.equal(capacity.status, "connected");
  assert.equal(capacity.rows[0].asOf, next);

  const notice = await readNotices({ V1_NOTICE_FEED_URL: sourceUrl }, new Set(["PHP"]), undefined, async () => {
    t.mock.timers.tick(1000);
    return Response.json({
      status: [{ board: "PHP", lastSuccess: iso(now + 2000) }],
      notices: [{ id: "1", board: "PHP", title: "OFO", category: "OFO", effectiveFrom: next }],
    });
  });
  assert.equal(notice.status, "connected");
  assert.equal(notice.notices[0].upcoming, false);
});

test("all five Central deadlines roll over in DST and track the intended gas day", () => {
  const next = cycleClock(new Date(now));
  assert.deepEqual(next.map(({ name }) => name), ["ID2", "Evening", "ID3", "ID1", "Timely"]);
  assert.equal(next[0].deadline, "2026-07-20T14:30:00.000-05:00");
  assert.equal(next[0].remainingMs, 90 * 60000);
  assert.equal(next[1].deadline, "2026-07-20T18:00:00.000-05:00");
  assert.deepEqual(next.map(({ gasDay }) => gasDay), ["2026-07-20", "2026-07-21", "2026-07-20", "2026-07-21", "2026-07-22"]);
  assert.equal(cycleClock(new Date("2026-03-08T02:30:00Z"))[0].deadline, "2026-03-08T10:00:00.000-05:00");
});

for (const { gasDay, priorDay, priorOffset, offset, beforeEvening, afterID3, hoursToID1 } of [
  { gasDay: "2026-03-08", priorDay: "2026-03-07", priorOffset: "-06:00", offset: "-05:00",
    beforeEvening: "2026-03-07T23:59:59.999Z", afterID3: "2026-03-08T01:00:00Z", hoursToID1: 14 },
  { gasDay: "2026-11-01", priorDay: "2026-10-31", priorOffset: "-05:00", offset: "-06:00",
    beforeEvening: "2026-10-31T22:59:59.999Z", afterID3: "2026-11-01T00:00:00Z", hoursToID1: 16 },
]) {
  test(`nomination deadlines and countdown cross the DST change for gas day ${gasDay}`, () => {
    const beforeTimely = new Date(`${priorDay}T12:59:00${priorOffset}`);
    const dayAhead = cycleClock(beforeTimely);
    assert.deepEqual(dayAhead.filter((cycle) => cycle.gasDay === gasDay).map(({ name, deadline }) => [name, deadline]), [
      ["Timely", `${priorDay}T13:00:00.000${priorOffset}`],
      ["Evening", `${priorDay}T18:00:00.000${priorOffset}`],
      ["ID1", `${gasDay}T10:00:00.000${offset}`],
    ]);
    const before = Date.parse(beforeEvening);
    const [evening] = cycleClock(new Date(before));
    assert.equal(evening.name, "Evening");
    assert.equal(evening.remainingMs, 1);
    assert.equal(cycleClock(new Date(before + 1))[0].name, "ID3");

    const intraday = cycleClock(new Date(afterID3));
    assert.equal(intraday.length, 5);
    assert.equal(intraday[0].remainingMs, hoursToID1 * 3600000);
    assert.deepEqual(intraday.filter((cycle) => cycle.gasDay === gasDay).map(({ name, deadline }) => [name, deadline]), [
      ["ID1", `${gasDay}T10:00:00.000${offset}`],
      ["ID2", `${gasDay}T14:30:00.000${offset}`],
      ["ID3", `${gasDay}T19:00:00.000${offset}`],
    ]);
  });
}

test("webhook retries failures, deduplicates OFOs and emits capacity deltas once", async () => {
  const posts = [];
  const tracker = alertTracker({
    webhookUrl: sourceUrl,
    fetcher: async (url, options) => {
      assert.equal(url, sourceUrl);
      assert.equal(options.method, "POST");
      posts.push(JSON.parse(options.body));
      return new Response(null, { status: posts.length === 1 ? 503 : 204 });
    },
    log: { warn() {} },
  });
  const notice = { board: "PHP", key: "PHP:1", title: "OFO" };
  const old = { edgeId: "php-katy", oac: 60, asOf: iso(now), sourceUrl };
  const latest = { ...old, oac: 40, asOf: iso(now + 2000) };
  await tracker.observe([notice], [old], now);
  const alerts = await tracker.observe([notice], [latest], now + 2000);
  await tracker.observe([notice], [old], now + 3000);
  assert.deepEqual(posts.map(({ type, delta }) => [type, delta]), [["ofo", undefined], ["ofo", undefined], ["capacity", -20]]);
  assert.equal(posts[0].id, posts[1].id);
  assert.equal(alerts.length, 2);
});

test("permanent webhook rejection does not block later alerts", async () => {
  const posts = [];
  const statuses = [422, 429, 204, 204];
  const tracker = alertTracker({
    webhookUrl: sourceUrl,
    fetcher: async (_, options) => {
      posts.push(JSON.parse(options.body).key);
      return new Response(null, { status: statuses.shift() });
    },
    log: { warn() {} },
  });
  const notices = ["rejected", "rate-limited", "following"].map((key) => ({ key }));
  await tracker.observe(notices, [], now);
  assert.deepEqual(posts, ["rejected", "rate-limited"]);
  await tracker.observe(notices, [], now + 2000);
  assert.deepEqual(posts, ["rejected", "rate-limited", "rate-limited", "following"]);
});

test("unconfigured webhook writes a dry-run alert without networking", async () => {
  const messages = [];
  const tracker = alertTracker({ fetcher: () => assert.fail("Unexpected network call"), log: { info: (...args) => messages.push(args) } });
  await tracker.observe([{ key: "PHP:1", title: "OFO" }], [], now);
  assert.equal(messages[0][0], "[v2 alert dry-run]");
  assert.equal(JSON.parse(messages[0][1]).id, "ofo:PHP:1");
});

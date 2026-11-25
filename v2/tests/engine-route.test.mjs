import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "../app/api/engine/route.js";

test("route scenarios show upcoming OFOs and capacity constraints before the Evening deadline", async (t) => {
  const now = Date.parse("2026-10-31T22:55:00Z");
  const iso = (time) => new Date(time).toISOString();
  t.mock.timers.enable({ apis: ["Date"], now });
  t.mock.method(console, "info", () => {});
  const notice = { board: "PHP", category: "OFO", sourceUrl: "https://example.com/board" };
  const katySegment = "php-katy-oasis";
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url === `${process.env.V1_NOTICE_FEED_URL}?category=OFO`) {
      return Response.json({
        status: [{ board: "PHP", lastSuccess: iso(now) }],
        notices: [
          { ...notice, id: "1", title: "Starts soon", effectiveFrom: iso(now + 30_000) },
          { ...notice, id: "2", title: "Ends soon", effectiveThrough: iso(now + 30_000) },
          { ...notice, id: "3", board: "GCX", title: "Different board" },
        ],
      });
    }
    assert.equal(url, process.env.OAC_FEED_URL);
    return Response.json({
      segments: [
        { edgeId: "agua-blanca-waha", oac: 50_000 },
        { edgeId: katySegment, oac: 1 },
        { edgeId: "gcx-agua-dulce-tejas", oac: 50_000 },
      ].map((segment) => ({ ...segment, asOf: iso(now), sourceUrl: notice.sourceUrl })),
    });
  });
  const vars = {
    V1_NOTICE_FEED_URL: "https://example.com/notices", OAC_FEED_URL: "https://example.com/capacity",
    NEO4J_URI: "", ALERT_WEBHOOK_URL: "",
  };
  for (const [key, value] of Object.entries(vars)) {
    const prior = process.env[key];
    process.env[key] = value;
    t.after(() => { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; });
  }

  const evaluate = async () => {
    const response = await POST(new Request("http://localhost/api/engine", {
      method: "POST",
      body: JSON.stringify({ origin: "delaware", supplyPrice: 2.25, demand: 35000, markets: { katy: 3.1, "agua-dulce": 3.1, hsc: 3.35 } }),
    }));
    assert.equal(response.status, 200);
    return response.json();
  };
  const snapshot = await (await GET()).json();
  const first = await evaluate();
  assert.deepEqual(first.cycles, snapshot.cycles);
  assert.equal(first.cycles[0].name, "Evening");
  assert.equal(first.cycles[0].remainingMs, 300_000);
  const php = (evaluation) => evaluation.result.routes.flatMap(({ segments }) => segments).find(({ id }) => id === katySegment);
  assert.equal(php(first).constrained, true);
  assert.equal(php(first).capacitySource, "reported");
  assert.deepEqual(php(first).ofos.map(({ title, upcoming }) => [title, upcoming]), [
    ["Starts soon", true], ["Ends soon", false],
  ]);
  assert.ok(first.result.routes.some(({ feasible, segments }) =>
    feasible && segments.some(({ ofos }) => ofos.some(({ title }) => title === "Different board"))));

  t.mock.timers.tick(45_000);
  const later = await evaluate();
  assert.equal(later.asOf, first.asOf);
  assert.deepEqual(php(later).ofos.map(({ title, upcoming }) => [title, upcoming]), [["Starts soon", false]]);
});

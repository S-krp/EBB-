import { alertTracker } from "./alerts.mjs";
import { readCapacity, readNotices } from "./feeds.mjs";
import { withCapacity } from "./graph.mjs";
import { graphStore } from "./neo4j.mjs";

const interval = 60_000;
const key = Symbol.for("ebb-permian-v2-engine");

export function engine() {
  if (globalThis[key]) return globalThis[key];
  const store = graphStore();
  const tracker = alertTracker({ webhookUrl: process.env.ALERT_WEBHOOK_URL });
  let snapshot;
  let refreshing;
  let timer;

  async function refresh() {
    const graph = await store.read();
    const now = Date.now();
    const [ofo, oac] = await Promise.all([
      readNotices(process.env, new Set(graph.edges.map(({ board }) => board).filter(Boolean)), now)
        .catch(() => ({ notices: [], status: "unavailable" })),
      readCapacity(process.env, new Set(graph.edges.map(({ id }) => id)), now)
        .catch(() => ({ rows: [], status: "unavailable" })),
    ]);
    const alerts = await tracker.observe(ofo.notices, oac.rows, now);
    snapshot = {
      graph: withCapacity(graph, oac.rows), notices: ofo.notices, alerts,
      feeds: { ofo: ofo.status, oac: oac.status, missedBoards: ofo.missed ?? [] },
      asOf: new Date(now).toISOString(), backend: store.name,
    };
    return snapshot;
  }

  function update() {
    refreshing ??= refresh().finally(() => { refreshing = undefined; });
    return refreshing;
  }

  globalThis[key] = {
    read() {
      return snapshot && Date.now() - Date.parse(snapshot.asOf) < interval ? snapshot : update();
    },
    start() {
      if (timer) return;
      const run = () => update().catch(() => console.warn("[v2 engine] Graph refresh failed."));
      void run();
      timer = setInterval(run, interval);
      timer.unref();
    },
  };
  return globalThis[key];
}

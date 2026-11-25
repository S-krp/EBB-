import { isFreshCapacity, webUrl } from "./feeds.mjs";

export function alertTracker({ webhookUrl, fetcher = fetch, log = console } = {}) {
  const seen = new Set();
  const previous = new Map();
  const pending = new Map();
  const recent = new Map();
  function add(alert, body) {
    if (seen.has(alert.id)) return;
    seen.add(alert.id);
    pending.set(alert.id, alert);
    recent.set(alert.id, body ? { ...alert, body } : alert);
    if (recent.size > 25) recent.delete(recent.keys().next().value);
  }

  return {
    capacityAt(now) {
      return [...previous.values()].filter(({ asOf }) => isFreshCapacity(asOf, now));
    },
    async observe(notices, capacity, now) {
      const observedAt = new Date(now).toISOString();
      for (const { body, ...notice } of notices) add({ ...notice, id: `ofo:${notice.key}`, type: "ofo", observedAt }, body);
      for (const row of capacity) {
        const prior = previous.get(row.edgeId);
        if (prior && row.asOf <= prior.asOf) continue;
        if (prior && row.oac !== prior.oac) {
          const delta = row.oac - prior.oac;
          add({
            id: `oac:${row.edgeId}:${row.asOf}`, type: "capacity", edgeId: row.edgeId, delta,
            title: `${row.edgeId} OAC ${delta > 0 ? "+" : ""}${delta} Dth/day`,
            before: prior.oac, after: row.oac, sourceUrl: row.sourceUrl, observedAt,
          });
        }
        previous.set(row.edgeId, row);
      }
      const webhook = webUrl(webhookUrl);
      for (const alert of [...pending.values()].slice(0, 25)) {
        try {
          if (!webhookUrl) log.info("[v2 alert dry-run]", JSON.stringify(alert));
          else {
            if (!webhook) throw new Error("Not an HTTP(S) URL");
            const response = await fetcher(webhook, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alert),
              signal: AbortSignal.timeout(5_000), redirect: "error",
            });
            if (!response.ok) {
              const status = response.status;
              if (status < 400 || status >= 500 || [408, 425, 429].includes(status)) throw new Error(`HTTP ${status}`);
              log.warn(`[v2 alert] Webhook permanently rejected an alert (HTTP ${status}); discarding delivery.`);
            }
          }
          pending.delete(alert.id);
        } catch {
          log.warn("[v2 alert] Webhook delivery failed; will retry.");
          break;
        }
      }
      return [...recent.values()].reverse();
    },
  };
}

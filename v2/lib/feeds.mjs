const DEFAULT_NOTICE_URL = "https://ebb-watch--t6fdes23.preview.devinapps.com/api/feed";
const MAX_OAC_AGE_MS = 12 * 60 * 60 * 1000;

export function isFreshCapacity(asOf, now) {
  const age = now - Date.parse(asOf);
  return age >= 0 && age <= MAX_OAC_AGE_MS;
}

export function webUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

async function readJson(url, fetcher) {
  if (!webUrl(url)) throw new Error("Feed is not an HTTP(S) URL");
  const response = await fetcher(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
  return response.json();
}

export async function readNotices(env, boards, now, fetcher = fetch) {
  const url = env.V1_NOTICE_FEED_URL ?? DEFAULT_NOTICE_URL;
  if (!url) return { notices: [], status: "disabled" };
  const data = await readJson(url, fetcher);
  if (!Array.isArray(data.notices) || !Array.isArray(data.status)) throw new Error("Unrecognized EBB Watch feed");
  const missed = [...boards].filter((board) => !data.status.some((row) =>
    row.board === board && !row.error && Date.parse(row.lastSuccess) <= now &&
    now - Date.parse(row.lastSuccess) <= MAX_OAC_AGE_MS));
  const notices = data.notices.filter((row) =>
    row.category === "OFO" && boards.has(row.board) && row.id != null && typeof row.title === "string" &&
    !(Date.parse(row.effectiveThrough) < now),
  ).map((row) => ({
    key: `${row.board}:${row.id}:${row.hash ?? row.title}`, board: row.board, title: row.title,
    sourceUrl: webUrl(row.sourceUrl), effectiveFrom: row.effectiveFrom ?? null,
    effectiveThrough: row.effectiveThrough ?? null,
    upcoming: Date.parse(row.effectiveFrom) > now,
  }));
  return { notices, status: missed.length ? "partial" : "connected", missed };
}

export async function readCapacity(env, edgeIds, now, fetcher = fetch) {
  if (!env.OAC_FEED_URL) return { rows: [], status: "disabled" };
  const data = await readJson(env.OAC_FEED_URL, fetcher);
  if (!Array.isArray(data.segments)) throw new Error("Unrecognized capacity feed");
  const seen = new Set();
  const rows = [];
  for (const row of data.segments) {
    if (!edgeIds.has(row.edgeId)) continue;
    const asOf = Date.parse(row.asOf);
    if (seen.has(row.edgeId) || !Number.isFinite(asOf) || asOf > now || !webUrl(row.sourceUrl) ||
      !Number.isFinite(row.oac) || row.oac < 0 ||
      (row.scheduledVolume != null && (!Number.isFinite(row.scheduledVolume) || row.scheduledVolume < 0))) {
      throw new Error("Invalid or duplicate capacity observation");
    }
    seen.add(row.edgeId);
    if (isFreshCapacity(row.asOf, now)) rows.push({
      edgeId: row.edgeId, asOf: new Date(asOf).toISOString(), oac: row.oac,
      scheduledVolume: row.scheduledVolume, sourceUrl: webUrl(row.sourceUrl),
    });
  }
  return { rows, status: rows.length === edgeIds.size ? "connected" : "partial" };
}

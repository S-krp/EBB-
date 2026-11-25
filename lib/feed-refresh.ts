import type { Snapshot } from "./model";

export function createFeedRefresh(setSnapshot: (snapshot: Snapshot) => void, setFeedError: (error: string) => void) {
  let requested = 0;
  let applied = 0;
  let appliedEtag: string | null = null;

  return async () => {
    const requestId = ++requested;
    let snapshot: Snapshot | null = null;
    let etag: string | null = null;
    let unchanged = false;
    try {
      const response = await fetch("/api/feed", { cache: "no-cache" });
      if (response.ok) {
        etag = response.headers.get("etag");
        unchanged = !!etag && etag === appliedEtag;
        if (!unchanged) snapshot = await response.json() as Snapshot;
      }
    } catch {
      snapshot = null;
    }
    if (requestId < applied) return;
    applied = requestId;
    if (snapshot) {
      appliedEtag = etag;
      setSnapshot(snapshot);
    }
    setFeedError(snapshot || unchanged ? "" : "Could not load the notice feed. Retrying automatically.");
  };
}

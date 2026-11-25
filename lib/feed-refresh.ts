import type { Snapshot } from "./model";

export function createFeedRefresh(setSnapshot: (snapshot: Snapshot) => void, setFeedError: (error: string) => void) {
  let requested = 0;
  let applied = 0;

  return async () => {
    const requestId = ++requested;
    let snapshot: Snapshot | null = null;
    try {
      const response = await fetch("/api/feed", { cache: "no-store" });
      if (response.ok) snapshot = await response.json() as Snapshot;
    } catch {
      snapshot = null;
    }
    if (requestId < applied) return;
    applied = requestId;
    if (snapshot) setSnapshot(snapshot);
    setFeedError(snapshot ? "" : "Could not load the notice feed. Retrying automatically.");
  };
}

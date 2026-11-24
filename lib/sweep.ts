import { randomUUID } from "node:crypto";
import { claimSweep, releaseSweep, saveBoard } from "./db";
import { boardIds, type BoardStatus, type Notice } from "./model";
import { normalize } from "./normalize";
import { scrapeBoard } from "./scrapers";

export async function sweep(): Promise<BoardStatus[] | null> {
  const owner = randomUUID();
  if (!await claimSweep(owner)) return null;
  const lastAttempt = new Date().toISOString();
  try {
    const runs = await Promise.allSettled(boardIds.map(async (board) => {
      const unique = new Map<string, Notice>();
      const result = await scrapeBoard(board).catch((error: unknown) => ({
        notices: [], errors: [error instanceof Error ? error.message : String(error)],
      }));
      for (const raw of result.notices) {
        if (!raw.title || !raw.id) {
          result.errors.push("Invalid notice metadata");
          continue;
        }
        const notice = normalize(raw);
        const key = JSON.stringify([notice.pipeline, notice.id]);
        const existing = unique.get(key);
        if (!existing || (!existing.critical && notice.critical) || (existing.category === "Non-Critical" && notice.category === "Maintenance")) {
          unique.set(key, notice);
        }
      }
      const error = result.errors.length
        ? result.errors.slice(0, 3).join("; ") + (result.errors.length > 3 ? ` (+${result.errors.length - 3} more)` : "")
        : null;
      const status = { board, count: unique.size, lastAttempt, lastSuccess: error ? null : new Date().toISOString(), error };
      await saveBoard([...unique.values()], status);
      return status;
    }));
    const errors = runs.filter((result) => result.status === "rejected");
    if (errors.length) throw new AggregateError(errors.map(({ reason }) => reason), "Could not save board sweep results");
    return runs.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  } finally {
    await releaseSweep(owner);
  }
}

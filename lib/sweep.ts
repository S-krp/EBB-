import { randomUUID } from "node:crypto";
import { claimSweep, recordScheduledSweep, recordSweepFinish, releaseSweep, saveBoard, scheduledSweepCompleted, sweepCooldownSeconds } from "./db";
import { boardIds, type BoardStatus, type Notice } from "./model";
import { normalize } from "./normalize";
import { scrapeBoard } from "./scrapers";

export class SweepCooldown extends Error {
  constructor(readonly retryAfter: number) {
    super(`Please wait ${retryAfter} seconds before starting another sweep.`);
  }
}

export async function sweep({ manual = false, slot }: { manual?: boolean; slot?: string } = {}): Promise<BoardStatus[] | null> {
  const owner = randomUUID();
  if (!await claimSweep(owner)) return null;
  let started = false;
  try {
    if (slot && await scheduledSweepCompleted(slot)) return null;
    if (manual) {
      const retriesIn = await sweepCooldownSeconds();
      if (retriesIn) throw new SweepCooldown(retriesIn);
    }
    started = true;
    const lastAttempt = new Date().toISOString();
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
    if (slot) await recordScheduledSweep(slot);
    return runs.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  } finally {
    try {
      if (started) await recordSweepFinish();
    } finally {
      await releaseSweep(owner);
    }
  }
}

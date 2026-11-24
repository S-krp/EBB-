import cron from "node-cron";
import { centralZone } from "./normalize";
import { cronExpression } from "./schedule";
import { sweep } from "./sweep";

const runtime = globalThis as typeof globalThis & { ebbWorker?: ReturnType<typeof cron.schedule> };

export function startWorker() {
  runtime.ebbWorker ??= cron.schedule(cronExpression, async () => {
    try {
      await sweep();
    } catch (error) {
      console.error("Scheduled EBB sweep failed", error);
    }
  }, { timezone: centralZone, noOverlap: true });
}

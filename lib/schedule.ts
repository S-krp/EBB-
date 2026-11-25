import { DateTime } from "luxon";
import { centralZone } from "./normalize";

export const sweepHours = [9, 13, 18, 22];
export const cronExpression = `0 ${sweepHours.join(",")} * * *`;

export function nextSweep(now = new Date()) {
  const local = DateTime.fromJSDate(now, { zone: centralZone });
  for (const hour of sweepHours) {
    const slot = local.set({ hour, minute: 0, second: 0, millisecond: 0 });
    if (slot > local) return slot.toUTC().toISO()!;
  }
  return local.plus({ days: 1 }).set({ hour: sweepHours[0], minute: 0, second: 0, millisecond: 0 }).toUTC().toISO()!;
}

export function isScheduledHour(now = new Date()) {
  return scheduledSweepSlot(now) !== null;
}

export function scheduledSweepSlot(now = new Date()) {
  const local = DateTime.fromJSDate(now, { zone: centralZone });
  return sweepHours.includes(local.hour) ? local.startOf("hour").toUTC().toISO() : null;
}

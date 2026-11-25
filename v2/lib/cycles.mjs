import { DateTime } from "luxon";

export const centralZone = "America/Chicago";
export const cycles = [
  { name: "ID1", hour: 10, minute: 0, nextGasDay: false },
  { name: "Timely", hour: 13, minute: 0, nextGasDay: true },
  { name: "ID2", hour: 14, minute: 30, nextGasDay: false },
  { name: "ID3", hour: 19, minute: 0, nextGasDay: false },
  { name: "Evening", hour: 20, minute: 0, nextGasDay: true },
];

export function cycleClock(now = new Date()) {
  const local = DateTime.fromJSDate(now, { zone: centralZone });
  const upcoming = [local, local.plus({ days: 1 })].flatMap((day) => cycles.map((cycle) => {
    const deadline = day.set({ hour: cycle.hour, minute: cycle.minute, second: 0, millisecond: 0 });
    return {
      name: cycle.name,
      gasDay: day.plus({ days: Number(cycle.nextGasDay) }).toISODate(),
      deadline: deadline.toISO(),
      localTime: deadline.toFormat("h:mm a ZZZZ"),
      remainingMs: deadline - local,
    };
  })).filter(({ remainingMs }) => remainingMs > 0);
  return upcoming.slice(0, cycles.length);
}

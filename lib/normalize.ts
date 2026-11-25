import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import type { Notice, RawNotice } from "./model";

export const centralZone = "America/Chicago";

export function noticeDate(input: string | null | undefined, zone = centralZone) {
  if (!input || /^(none|n\/a|9000|9999)/i.test(input)) return null;
  const cleaned = input.trim().replace(/\s+/g, " ").replace(/([\d])(AM|PM)\b/i, "$1 $2");
  const opts = { zone, locale: "en-US" };
  const iso = DateTime.fromISO(cleaned, opts);
  if (iso.isValid) return iso.toUTC().toISO();
  for (const pattern of ["M/d/yyyy h:mm:ss a", "M/d/yyyy h:mm a", "M/d/yyyy", "MMM d yyyy h:mm:ss a", "MMM d yyyy h:mm a"]) {
    const date = DateTime.fromFormat(cleaned, pattern, opts);
    if (date.isValid) return date.toUTC().toISO();
  }
  return null;
}

export function transwesternEndDate(input: string | null | undefined) {
  const date = noticeDate(input);
  return date && DateTime.fromISO(date, { zone: centralZone }).toISODate() === "2999-12-31" ? null : date;
}

export function normalize(raw: RawNotice): Notice {
  const subject = raw.sourceType + " " + raw.title;
  const emergency = /\bemergenc(?:y|ies)\b/i.test(subject) || /\bemergency (?:notice|shutdown|posting|condition|response)\b/i.test(raw.body);
  const ofo = /\b(?:OFOs?|operational flow orders?)\b/i;
  const forceMajeure = /\bforce majeure\b/i;
  const maintenance = /\b(?:maintenance|scheduled outage|planned (?:service )?outage)\b/i;
  const category = ofo.test(subject) ? "OFO"
    : forceMajeure.test(subject) ? "Force Majeure"
    : maintenance.test(subject) ? "Maintenance"
    : raw.board !== "LINK" && ofo.test(raw.body) ? "OFO"
    : forceMajeure.test(raw.body) ? "Force Majeure"
    : raw.critical || emergency ? "Critical"
    : maintenance.test(raw.body) ? "Maintenance" : "Non-Critical";
  const tolerance = "(?:tolerances?|imbalances?|percent(?:age)? of (?:scheduled|confirmed))";
  const percent = "(?:[±+−-]\\s*)?\\d+(?:\\.\\d+)?\\s*(?:%|percent\\b)";
  const nearby = new RegExp(`(${tolerance})[^.!?%\\n]{0,65}?(${percent})|(${percent})[^.!?\\n]{0,35}?(${tolerance})`, "gi");
  const tableCell = new RegExp(`^OFO in effect:[ \\t]*(?:\\n[ \\t]*)?(?:[^%\\n]{1,60}\\n[ \\t]*)?(${percent})[ \\t]*/[ \\t]*[\\d,]+`, "gim");
  const matches = category === "OFO" ? [...subject.concat("\n", raw.body).matchAll(nearby)].map((m) => m[2] || m[3]) : [];
  if (category === "OFO" && raw.board === "LINK") matches.push(...[...raw.body.matchAll(tableCell)].map((m) => m[1]));
  const tolerances = [...new Set(matches.map((m) => m.replace(/\s*percent/i, "%").replace(/\s/g, "")))];
  const hash = createHash("sha256").update(JSON.stringify([
    raw.board, raw.pipeline, raw.id, raw.title, raw.sourceType, raw.critical, raw.postedAt,
    raw.effectiveFrom, raw.effectiveThrough, raw.sourceUrl, raw.body, category, emergency, tolerances,
  ])).digest("hex");
  return { ...raw, critical: raw.critical || emergency || category === "OFO" || category === "Force Majeure", category, emergency, tolerances, hash };
}

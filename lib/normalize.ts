import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import type { Notice, RawNotice } from "./model";
import { isLifted } from "./notice-status";

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
  const ofoHeading = /^(?:[a-z -]+ )?OFO$/i;
  const activeOrders: string[] = [];
  if (raw.board === "LINK") {
    const lines = raw.body.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const [index, line] of lines.entries()) {
      const next = lines[index + 1];
      if (ofoHeading.test(line) && next && !ofoHeading.test(next) && !/^(?:[-–—]+|n\/?a|none)$/i.test(next)) activeOrders.push(next);
    }
  }
  const explicitOfo = ofo.test(subject);
  const category = explicitOfo || activeOrders.length ? "OFO"
    : forceMajeure.test(subject) ? "Force Majeure"
    : maintenance.test(subject) ? "Maintenance"
    : raw.critical || emergency ? "Critical" : "Non-Critical";
  const tolerance = "(?:tolerances?|imbalances?|percent(?:age)? of (?:scheduled|confirmed))";
  const percent = "(?:[±+−-]\\s*)?\\d+(?:\\.\\d+)?\\s*(?:%|percent\\b)";
  const tableEntry = `\\bOFO in effect:[ \\t]*\\n+(?:No (?:D[PS]|Due (?:Pipe|Shipper))[ \\t]*\\n+)?(${percent})(?=[ \\t]*/)`;
  const nearby = new RegExp(`${tolerance}[^.!?%\\n]{0,65}?(${percent})|(${percent})[^.!?\\n]{0,35}?${tolerance}|${tableEntry}`, "gi");
  const lifted = (category === "OFO" || category === "Force Majeure") && isLifted(raw);
  const toleranceText = explicitOfo ? subject.concat("\n", raw.body) : activeOrders.join("\n");
  const tolerances = category === "OFO" && !lifted
    ? [...new Set([...toleranceText.matchAll(nearby)].map((m) => (m[1] || m[2] || m[3]).replace(/\s*percent/i, "%").replace(/\s/g, "")))]
    : [];
  const critical = !lifted && (raw.critical || emergency || category === "OFO" || category === "Force Majeure");
  const hash = createHash("sha256").update(JSON.stringify([
    raw.board, raw.pipeline, raw.id, raw.title, raw.sourceType, raw.critical, raw.postedAt,
    raw.effectiveFrom, raw.effectiveThrough, raw.sourceUrl, raw.body, category, critical, emergency, tolerances,
  ])).digest("hex");
  return { ...raw, critical, category, emergency, tolerances, hash };
}

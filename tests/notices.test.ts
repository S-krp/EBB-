import assert from "node:assert/strict";
import { test } from "node:test";
import type { RawNotice } from "../lib/model";
import { normalize, noticeDate } from "../lib/normalize";
import { isScheduledHour, nextSweep } from "../lib/schedule";

const notice: RawNotice = {
  board: "EPNG", pipeline: "El Paso Natural Gas", id: "123",
  title: "Operational Flow Order for the gas day", sourceType: "System alert", body: "Imbalance tolerance is ±5%. Meter utilization is 85%.",
  critical: false, postedAt: null, effectiveFrom: null, effectiveThrough: null, sourceUrl: "https://example.com/123",
};

test("classifies an OFO and reports tolerance without unrelated percentages", () => {
  const result = normalize(notice);
  assert.equal(result.category, "OFO");
  assert.equal(result.critical, true);
  assert.deepEqual(result.tolerances, ["±5%"]);
});

test("hashes identical content consistently and detects edits", () => {
  assert.match(normalize(notice).hash, /^[a-f0-9]{64}$/);
  assert.equal(normalize(notice).hash, normalize({ ...notice }).hash);
  assert.notEqual(normalize(notice).hash, normalize({ ...notice, body: "Order lifted." }).hash);
});

test("keeps LINK pipeline conditions critical rather than treating an OFO reference as an order", () => {
  const report = {
    ...notice,
    board: "LINK" as const,
    id: "185944",
    title: "AGT Pipeline Conditions for 11/25/2026",
    sourceType: "Capacity Constraint",
    body: "No-Notice Restrictions\n\nOFO / Imbalance Notice\n\nSystem Wide OFO\n---\n\nCustomer Specific OFO\n---",
    critical: true,
  };
  assert.equal(normalize(report).category, "Critical");
  assert.equal(normalize({ ...report, sourceType: "Operational Flow Order" }).category, "OFO");
});

test("preserves maintenance category and critical flag for a critical outage", () => {
  const result = normalize({ ...notice, title: "Planned service outage", body: "Line unavailable.", critical: true });
  assert.equal(result.category, "Maintenance");
  assert.equal(result.critical, true);
});

test("reads LINK OFO table cells without treating narrative thresholds as tolerances", () => {
  const result = normalize({
    ...notice, board: "LINK", id: "185864",
    body: "Scheduled quantities plus 500 Dth or 108% of scheduled delivery quantities.\n"
      + "See below for tolerance percentages:\n\nOFO In Effect:\nNo DS\n10% / 500\n\n"
      + "No OFO*\n\nOFO In Effect:\nNo DP\n8% / 500",
  });
  assert.deepEqual(result.tolerances, ["10%", "8%"]);
});

test("normalizes portal timestamps and suppresses open-ended placeholders", () => {
  assert.equal(noticeDate("11/24/2026  4:16:31PM"), "2026-11-24T22:16:31.000Z");
  assert.equal(noticeDate("Nov 24 2026  6:56AM"), "2026-11-24T12:56:00.000Z");
  assert.equal(noticeDate("9000-12-31T00:00:00"), null);
});

test("schedules in Central time across daylight saving and midnight", () => {
  assert.equal(nextSweep(new Date("2026-03-08T04:00:00Z")), "2026-03-08T14:00:00.000Z");
  assert.equal(nextSweep(new Date("2026-11-24T23:00:00Z")), "2026-11-25T00:00:00.000Z");
  assert.equal(nextSweep(new Date("2026-11-25T00:00:00Z")), "2026-11-25T04:00:00.000Z");
  assert.equal(isScheduledHour(new Date("2026-07-01T14:00:00Z")), true);
  assert.equal(isScheduledHour(new Date("2026-07-01T15:00:00Z")), false);
  assert.equal(isScheduledHour(new Date("2026-11-24T15:00:00Z")), true);
});

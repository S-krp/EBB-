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

test("does not treat empty LINK pipeline-condition OFO fields as an order", () => {
  const conditions: RawNotice = {
    ...notice, board: "LINK", title: "AGT Pipeline Conditions for 11/25/2026", sourceType: "Capacity Constraint", critical: true,
    body: "OFO / Imbalance Notice\n\nSystem Wide OFO\n---\n\nCustomer Specific OFO\n---\n\nImbalance Warnings\nStay Balanced",
  };
  assert.equal(normalize(conditions).category, "Critical");
  assert.equal(normalize({ ...conditions, body: conditions.body.replace("---", "No DS - 5% tolerance") }).category, "OFO");
  assert.equal(normalize({ ...conditions, title: "Operational Flow Order -- EFF 11/25" }).category, "OFO");
});

test("hashes identical content consistently and detects edits", () => {
  assert.match(normalize(notice).hash, /^[a-f0-9]{64}$/);
  assert.equal(normalize(notice).hash, normalize({ ...notice }).hash);
  assert.notEqual(normalize(notice).hash, normalize({ ...notice, body: "Order lifted." }).hash);
});

test("preserves maintenance category and critical flag for a critical outage", () => {
  const result = normalize({ ...notice, title: "Planned service outage", body: "Line unavailable.", critical: true });
  assert.equal(result.category, "Maintenance");
  assert.equal(result.critical, true);
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

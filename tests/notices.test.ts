import assert from "node:assert/strict";
import { test } from "node:test";
import type { RawNotice } from "../lib/model";
import { countNonLiftedOfos } from "../lib/notice-status";
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

test("extracts distinct OFO table tolerances across line breaks", () => {
  const result = normalize({
    ...notice,
    board: "LINK",
    sourceType: "Operational Flow Order",
    body: "Penalty applies above 108% of scheduled quantities.\n\n" +
      "OFO In Effect:\nNo DS\n10% / 500\n\nNo OFO*\n\nOFO In Effect:\nNo DP\n8% / 500\n\n" +
      "OFO In Effect:\nNo Due Shipper\n8% / 500",
  });
  assert.deepEqual(result.tolerances, ["10%", "8%"]);
});

test("does not reclassify pipeline conditions or open seasons from passing body references", () => {
  const body = "Refer to the separate Force Majeure, Operational Flow Order and maintenance notices.";
  assert.equal(normalize({
    ...notice, title: "CURRENT PIPELINE CONDITIONS", sourceType: "Pipeline Conditions", critical: true, body,
  }).category, "Critical");
  assert.equal(normalize({
    ...notice, title: "Open Season", sourceType: "Capacity Offering", body,
  }).category, "Non-Critical");
});

test("classifies only active LINK orders in pipeline conditions and reads their tolerances", () => {
  const report: RawNotice = {
    ...notice, board: "LINK", title: "Pipeline Conditions", sourceType: "Capacity Constraint", critical: true,
    body: "TABS Pool Tolerance: 1%.\nSystem Wide OFO\n\nNo DS - Issued 11/21/2026. 10% / 500Dth/d Tolerance\nCustomer Specific OFO\n---",
  };
  const result = normalize(report);
  assert.equal(result.category, "OFO");
  assert.deepEqual(result.tolerances, ["10%"]);
  assert.equal(normalize({
    ...report, body: "System Wide OFO\n\n---\nCustomer Specific OFO\n---\nSee prior OFO notices.",
  }).category, "Critical");
});

test("does not mark lifted orders critical or extract their old tolerances", () => {
  const ofo = normalize({ ...notice, title: "SOC Lifted - Location Specific Pack", sourceType: "Operational Flow Order", critical: true });
  assert.equal(ofo.category, "OFO");
  assert.equal(ofo.critical, false);
  assert.deepEqual(ofo.tolerances, []);
  const forceMajeure = normalize({
    ...notice, board: "NGPL", title: "FORCE MAJEURE - COMP STA 168 - LIFTED", sourceType: "Force Majeure", critical: true,
  });
  assert.equal(forceMajeure.category, "Force Majeure");
  assert.equal(forceMajeure.critical, false);
});

test("counts active OFOs without counting lifted or rescinded notices", () => {
  assert.equal(countNonLiftedOfos([
    normalize(notice),
    normalize({ ...notice, title: "SOC Lifted - Location Specific Pack", sourceType: "Operational Flow Order", critical: true }),
    normalize({ ...notice, title: "OFO rescinded", critical: true }),
    normalize({ ...notice, title: "Force Majeure declared" }),
  ]), 1);
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

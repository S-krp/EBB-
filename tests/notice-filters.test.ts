import assert from "node:assert/strict";
import { test } from "node:test";
import type { Notice } from "../lib/model";
import { emptyNoticeFilters, filterNotices, hasInvertedRange, indexNotices, readNoticeFilters, writeNoticeFilters, type NoticeFilters } from "../lib/notice-filters";

const notice: Notice = {
  board: "EPNG", pipeline: "El Paso Natural Gas", id: "630346", title: "SOC Lifted - Location Specific Pack",
  body: "Imbalance tolerance is revised.", sourceType: "", category: "OFO", critical: true, emergency: false,
  postedAt: "2026-11-22T15:00:50Z", effectiveFrom: null, effectiveThrough: null,
  sourceUrl: "https://example.com/630346", hash: "", tolerances: [],
};

function matches(notices: Notice[], filters: Partial<NoticeFilters>) {
  return filterNotices(indexNotices(notices), { ...emptyNoticeFilters, ...filters }).map(({ id }) => id);
}

test("searches board code and category on notices whose text only uses the full pipeline name", () => {
  const otherBoard: Notice = { ...notice, id: "other", board: "NGPL", pipeline: "Natural Gas Pipeline Co. of America" };
  const otherType: Notice = { ...notice, id: "maintenance", category: "Maintenance" };
  const notices = [notice, otherBoard, otherType];
  assert.deepEqual(matches(notices, { query: "  ePnG  OFO " }), ["630346"]);
  assert.deepEqual(matches(notices, { query: "EPNG operational flow order" }), ["630346"]);
  assert.deepEqual(matches(notices, { query: "El Paso Natural Gas 630346" }), ["630346"]);
  assert.deepEqual(matches(notices, { query: "EPNG maint" }), ["maintenance"]);
  assert.deepEqual(matches([{ ...notice, category: "Force Majeure" }], { query: "FM" }), ["630346"]);
});

test("matches headline, body and classification terms together without matching partial queries", () => {
  assert.deepEqual(matches([notice], { query: "lifted TOLERANCE critical" }), ["630346"]);
  assert.deepEqual(matches([notice], { query: "lifted missing" }), []);
});

test("matches Non-Critical classification only by its exact aliases", () => {
  const nonCritical: Notice = { ...notice, id: "n0", category: "Non-Critical", critical: false };
  const notices: Notice[] = [
    nonCritical,
    { ...nonCritical, id: "n1", body: "Critical conditions are possible." },
    { ...nonCritical, id: "n2", title: "Critical conditions are possible" },
    { ...notice, id: "n3", category: "Critical" },
  ];
  for (const query of ["critical", "crit"]) {
    assert.deepEqual(matches(notices, { query }), ["n1", "n2", "n3"]);
  }
  for (const query of ["non-critical", "noncritical"]) {
    assert.deepEqual(matches(notices, { query: `EPNG ${query}` }), ["n0", "n1", "n2"]);
  }
});

test("treats spaced and hyphenated Non-Critical phrases as one search term", () => {
  const rows: Notice[] = [
    { ...notice, id: "n0", category: "Non-Critical", critical: false },
    { ...notice, id: "n1", body: "A non critical maintenance update." },
    { ...notice, id: "n2", title: "Non-critical maintenance update" },
    { ...notice, id: "n3", title: "Non-operational critical outage" },
  ];
  for (const query of ["EPNG NON   CRITICAL", "non-critical EPNG", "EPNG noncritical"]) {
    assert.deepEqual(matches(rows, { query }), ["n0", "n1", "n2"]);
  }
});

test("uses inclusive Central dates, excluding adjacent dates and undated notices only when bounded", () => {
  const rows = [
    { id: "before", postedAt: "2026-11-23T05:59:59Z" },
    { id: "first", postedAt: "2026-11-23T06:00:00Z" },
    { id: "last", postedAt: "2026-11-25T05:59:59Z" },
    { id: "after", postedAt: "2026-11-25T06:00:00Z" },
    { id: "undated", postedAt: null },
  ].map((row) => ({ ...notice, ...row }));
  assert.deepEqual(matches(rows, { range: { start: "2026-11-23", end: "2026-11-24" } }), ["first", "last"]);
  assert.deepEqual(matches(rows, { range: { start: "", end: "2026-11-23" } }), ["before", "first"]);
  assert.deepEqual(matches(rows, {}), ["before", "first", "last", "after", "undated"]);
});

test("does not interpret an inverted range as a valid lookup", () => {
  const range = { start: "2026-11-24", end: "2026-11-22" };
  assert.equal(hasInvertedRange(range), true);
  assert.equal(hasInvertedRange({ start: range.end, end: range.end }), false);
  assert.equal(hasInvertedRange({ start: range.start, end: "" }), false);
  assert.deepEqual(matches([notice], { range }), []);
});

test("takes the union within toggle groups and intersects with other filters", () => {
  const rows: Notice[] = [
    notice,
    { ...notice, id: "other", board: "NGPL", category: "Maintenance" },
    { ...notice, id: "wrong-board", board: "TW" },
    { ...notice, id: "wrong-type", category: "Critical" },
    { ...notice, id: "not-critical", category: "Maintenance", critical: false },
  ];
  assert.deepEqual(matches(rows, { pipelines: ["EPNG", "NGPL"], types: ["OFO", "Maintenance"], criticalOnly: true }), ["630346", "other"]);
});

test("round-trips all filter groups and clears only filter params", () => {
  const params = new URLSearchParams("other=keep&pipeline=TW&through=2026-11-21");
  const filters: NoticeFilters = {
    query: "EPNG + OFO", pipelines: ["EPNG", "NGPL"], types: ["OFO", "Force Majeure"], criticalOnly: true,
    range: { start: "2026-11-23", end: "2026-11-29" },
  };
  writeNoticeFilters(params, filters);
  assert.deepEqual(readNoticeFilters(params), filters);
  writeNoticeFilters(params, emptyNoticeFilters);
  assert.equal(params.toString(), "other=keep");
  assert.deepEqual(readNoticeFilters(params), emptyNoticeFilters);
});

test("ignores invalid URL values and keeps a valid date and unique known toggles", () => {
  const params = new URLSearchParams("pipeline=unknown&pipeline=EPNG&pipeline=EPNG&type=garbage&type=OFO&critical=0&from=2026-02-30&through=2026-03-01");
  assert.deepEqual(readNoticeFilters(params), {
    ...emptyNoticeFilters, pipelines: ["EPNG"], types: ["OFO"], range: { start: "", end: "2026-03-01" },
  });
});

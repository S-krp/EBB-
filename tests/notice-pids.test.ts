import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesPid, parsePids } from "../v2/lib/notice-pids.mjs";

test("PID filters match any supplied ID in notice titles or body text", () => {
  const pids = parsePids(" 40332, tpgs1130r\n AB_12-04, 40332 ");
  assert.deepEqual([...pids], ["40332", "TPGS1130R", "AB_12-04"]);
  assert.equal(matchesPid({ title: "Meter 40332 - Permian Highway Pipeline" }, pids), true);
  assert.equal(matchesPid({ title: "Storage conditions", body: "Permian Hwy Pipeline (TPGS1130R)." }, pids), true);
  assert.equal(matchesPid({ title: "OFO", body: "Point ID: ab_12-04." }, pids), true);
});

test("PID matches are exact and do not search notice numbers", () => {
  const pids = parsePids("40332 AB_12-04");
  const notice = { id: "40332", title: "Notice for 140332 and AB_12-040", body: "Additional points: 40332-10, X40332." };
  assert.equal(matchesPid(notice, pids), false);
  assert.equal(matchesPid({ title: "Meter 0005" }, parsePids("5")), false);
});

test("an empty PID filter allows notices without point references", () => {
  assert.equal(matchesPid({ title: "System-wide OFO" }, parsePids(" ,  ")), true);
  assert.equal(matchesPid({ title: "System-wide OFO" }, parsePids("40332")), false);
});

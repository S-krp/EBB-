import assert from "node:assert/strict";
import test from "node:test";
import { dashboardTabs, tabForKey } from "../lib/dashboard-tabs.mjs";

test("routes are the default tab and arrow keys wrap between dashboard views", () => {
  assert.equal(dashboardTabs[0].id, "routes");
  assert.equal(tabForKey("routes", "ArrowRight"), "notices");
  assert.equal(tabForKey("notices", "ArrowRight"), "routes");
  assert.equal(tabForKey("routes", "ArrowLeft"), "notices");
  assert.equal(tabForKey("notices", "ArrowLeft"), "routes");
});

test("Home and End select the first and last tabs without intercepting Tab", () => {
  assert.equal(tabForKey("notices", "Home"), "routes");
  assert.equal(tabForKey("routes", "End"), "notices");
  assert.equal(tabForKey("routes", "Tab"), null);
});

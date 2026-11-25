import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "cheerio";
import { contentFrom, noticeContent } from "../lib/notice-content";

test("preserves Word-style notice tables, empty cells, spans and surrounding prose", () => {
  const result = contentFrom(`<p>Before</p><table style="width:500px"><tr><td><p><b>Loc</b></p></td><td><b>Area</b></td><td><b>Action</b></td></tr>
    <tr><td rowspan="2"><p>301839</p></td><td></td><td><p>Watchlist<br>Lift</p></td></tr>
    <tr><td colspan="2">Second row</td></tr></table><p>Between</p><table><tr><th>Zone</th></tr><tr><td>NM-S</td></tr></table><p>After</p>`);
  assert.deepEqual(result.bodyBlocks, [
    { type: "text", text: "Before" },
    { type: "table", rows: [
      ["Loc", "Area", "Action"].map((text) => ({ text, header: true, colSpan: 1, rowSpan: 1 })),
      [{ text: "301839", header: false, colSpan: 1, rowSpan: 2 }, { text: "", header: false, colSpan: 1, rowSpan: 1 }, { text: "Watchlist\nLift", header: false, colSpan: 1, rowSpan: 1 }],
      [{ text: "Second row", header: false, colSpan: 2, rowSpan: 1 }],
    ] },
    { type: "text", text: "Between" },
    { type: "table", rows: [[{ text: "Zone", header: true, colSpan: 1, rowSpan: 1 }], [{ text: "NM-S", header: false, colSpan: 1, rowSpan: 1 }]] },
    { type: "text", text: "After" },
  ]);
  assert.match(result.body, /301839/);
});

test("does not retain active markup, scripts, styles or source attributes", () => {
  const result = noticeContent(load(`<div id="notice"><style>evil</style><script>alert(1)</script><table onclick="evil()"><tr><td><a href="javascript:evil()">&lt;img onerror=evil()&gt;</a><img src="https://tracker.test"></td></tr></table></div>`), "#notice");
  assert.deepEqual(result.bodyBlocks, [{ type: "table", rows: [[{ text: "<img onerror=evil()>", header: false, colSpan: 1, rowSpan: 1 }]] }]);
  assert.doesNotMatch(JSON.stringify(result), /alert\(1\)|tracker|javascript:|onclick/);
});

test("leaves non-table HTML and plain notices on the legacy text path", () => {
  assert.deepEqual(contentFrom("Line one\nLine two"), { body: "Line one\nLine two" });
  assert.deepEqual(contentFrom("<p>Line one</p><p>Line two</p>"), { body: "Line one\nLine two" });
});

test("keeps table captions", () => {
  const table = contentFrom("<table><caption>Capacity limits</caption><tr><td>10</td></tr></table>").bodyBlocks?.[0];
  assert.equal(table?.type === "table" && table.caption, "Capacity limits");
});

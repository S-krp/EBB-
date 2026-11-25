import assert from "node:assert/strict";
import { test } from "node:test";
import { scrapeBoard } from "../lib/scrapers";

test("keeps embedded document titles out of Kinder Morgan notice bodies", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("NoticeDetail.aspx")) return new Response(`<span id="body_Label12">
      <html><head><title>Pipeline Conditions</title></head><body><p>Current pipeline conditions.</p></body></html>
    </span>`);
    const row = url.includes("type=C")
      ? '<tr data-rowkey="[123]"><td><div><table><tbody><tr><td>Pipeline Conditions</td><td></td><td></td><td></td><td></td><td>123</td><td>Pipeline Conditions</td></tr></tbody></table></div></td></tr>'
      : '<tr data-rowkey="[null]"><td>No record(s) were found matching your query</td></tr>';
    return new Response(`<div id="board_DGNotices"><table><tbody>${row}</tbody></table></div>`);
  });
  const result = await scrapeBoard("NGPL");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.notices.map((notice) => notice.body), ["Current pipeline conditions."]);
});

test("links LINK notices using the portal route code rather than the listing abbreviation", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("notices-listings")) return Response.json({
      pipelines: [{ pipelineCode: "AGT", pipelineName: "Algonquin", notices: [{ noticeId: "123" }] }],
    });
    assert.match(url, /businessUnit=AGT/);
    return Response.json({ Notices: { Notice: { "@Noticeid": "123", NoticeTitle: "Pipeline conditions" } } });
  });
  const result = await scrapeBoard("LINK");
  assert.deepEqual(result.errors, []);
  assert.equal(result.notices[0].sourceUrl, "https://infopost.enbridge.com/noticedetails/AG/CRI/123");
});

test("omits LINK's default 90-day posting expiry but preserves actual end times", async (t) => {
  const record = {
    NoticeTitle: "TE Operational Flow Order -- EFF 11/25",
    NoticeTypeDescr: "Operational Flow Order",
    PostedDate: "11/24/2026", PostedTime: "07:47:02 AM",
    NoticeEffFromDate: "11/25/2026", NoticeEffFromTime: "09:00:00 AM",
    NoticeEffThruDate: "02/22/2027", NoticeEffThruTime: "07:55:00 AM",
    PostEffFromDate: "11/24/2026", PostEffFromTime: "07:55:00 AM",
    PostEffThruDate: "02/22/2027", PostEffThruTime: "07:55:00 AM",
  };
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("notices-listings")) return Response.json({
      pipelines: [{ pipelineCode: "TE", pipelineName: "Texas Eastern", notices: [{ noticeId: "1" }, { noticeId: "2" }, { noticeId: "3" }] }],
    });
    return Response.json({ Notices: { Notice: [
      { ...record, "@Noticeid": "1", NoticeText: { rawText: "This OFO will remain in effect until further notice." } },
      { ...record, "@Noticeid": "2", NoticeEffThruDate: "11/26/2026", NoticeEffThruTime: "09:00:00 AM" },
      { ...record, "@Noticeid": "3", PostEffFromTime: "08:55:00 AM" },
    ] } });
  });
  const result = await scrapeBoard("LINK");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.notices.map((notice) => notice.effectiveThrough), [
    null, "2026-11-26T15:00:00.000Z", "2027-02-22T13:55:00.000Z",
  ]);
});

test("reads Transwestern outage details when the notice label contains volume guidance", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/show/")) return new Response(`<div class="modal-body"><table>
      <tr><td><p>Notice Text:</p><p>Nominated Volume Affected</p></td>
      <td>Compressor station maintenance.<br>Capacity will be reduced.</td></tr>
    </table></div>`);
    const rows = url.includes("planned-service-outage") ? `<tr><td class="noticeId">
      <a href="/ipost/notice/show/123?asset=TW">123</a></td><td class="subject">Planned work</td>
    </tr>` : "";
    return new Response(`<table><thead><tr><th class="noticeId">Notice ID</th></tr></thead><tbody>${rows}</tbody></table>`);
  });
  const result = await scrapeBoard("TW");
  assert.deepEqual(result.errors, []);
  assert.equal(result.notices.length, 1);
  assert.equal(result.notices[0].body, "Compressor station maintenance.\nCapacity will be reduced.");
  assert.equal(result.notices[0].sourceType, "Planned service outage");
});

test("reads Transwestern capacity constraint details when the notice text cell is empty", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/show/")) return new Response(`<div class="modal-body"><table>
      <tr><td>Notice Text:</td><td></td></tr>
      <tr><td>Reason:</td><td>Exceeds Operating Capacity - Delivery Location</td></tr>
      <tr><td>Location:</td><td>M/L THOREAU WEST SYSTEM</td></tr>
    </table></div>`);
    const rows = url.includes("/non-critical?") ? `<tr><td class="noticeId">
      <a href="/ipost/notice/show/122163?asset=TW">122163</a></td><td class="subject">M/L THOREAU WEST SYSTEM</td>
      <td class="type">Capacity Constraint</td>
    </tr>` : "";
    return new Response(`<table><thead><tr><th class="noticeId">Notice ID</th></tr></thead><tbody>${rows}</tbody></table>`);
  });
  const result = await scrapeBoard("TW");
  assert.deepEqual(result.errors, []);
  assert.equal(result.notices.length, 1);
  assert.equal(result.notices[0].body, "Reason: Exceeds Operating Capacity - Delivery Location\nLocation: M/L THOREAU WEST SYSTEM");
});

test("falls back to the Carlsbad category when the board has no subtype", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    const critical = (options.body as URLSearchParams).get("CriticalNoticeCode");
    const Data = critical === "N" ? [{
      NoticeId: 123, NoticeSubject: "Board update", NoticeSubType: null, NoticeCategoryDesc: "OTHER",
      NoticeText: "Published body", ActionURL: "https://web-prd.myquorumcloud.com/WWMPA1IPWS/NoticePosting?NoticeId=123",
    }] : [];
    return Response.json({ Data, Total: Data.length });
  });
  const result = await scrapeBoard("CG");
  assert.deepEqual(result.errors, []);
  assert.equal(result.notices.length, 1);
  assert.equal(result.notices[0].sourceType, "OTHER");
});

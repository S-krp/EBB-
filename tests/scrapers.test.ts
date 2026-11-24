import assert from "node:assert/strict";
import { test } from "node:test";
import { scrapeBoard } from "../lib/scrapers";

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

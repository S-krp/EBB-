import { load } from "cheerio";
import { contentFrom, noticeContent } from "./notice-content";
import { DateTime } from "luxon";
import { boards, type BoardId, type RawNotice } from "./model";
import { centralZone, noticeDate, transwesternEndDate } from "./normalize";

type Result = { notices: RawNotice[]; errors: string[] };
type Collect = (label: string, run: () => Promise<RawNotice[]>) => Promise<void>;
type KinderBoard = "EPNG" | "NGPL" | "GCX" | "PHP";

const kinder = "https://pipeline2.kindermorgan.com";
const transfer = "https://twtransfer.energytransfer.com";
const enbridge = "https://infopost.enbridge.com";
const whitewater = "https://web-prd.myquorumcloud.com/WWMPA1IPWS";
const whitewaterTsps = { CG: 701, AB: 401, MXP: 502, WGS: 801 } as const;
type WhiteWaterBoard = keyof typeof whitewaterTsps;
// Quorum serves notice pages only for Carlsbad; the other TSPs return HTTP 500.
const whitewaterPublicPages = new Set<WhiteWaterBoard>(["CG"]);
const isWhiteWater = (board: BoardId): board is WhiteWaterBoard => board in whitewaterTsps;
const northern = "https://www.northernnaturalgas.com";
const trellis = "https://trellis-agora.trellisenergy.com/ptms";
const linkRouteCodes: Record<string, string> = { AGT: "AG", EHP: "EG", ETNG: "ET", MBHP: "MB", SGSC: "SG" };

export async function mapLimited<T>(items: readonly T[], concurrency: number, run: (item: T) => Promise<void>) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) await run(items[index++]);
  }));
}

async function request(url: string, options?: RequestInit, timeoutMs = 20_000) {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs), ...options });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${new URL(url).hostname}: ${reason}`);
  }
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  return response;
}

async function scrapeKinder(board: KinderBoard, collect: Collect) {
  for (const type of ["C", "N", "P"]) {
    await collect(type + " listing", async () => {
      const $ = load(await (await request(`${kinder}/Notices/Notices.aspx?type=${type}&code=${board}`)).text());
      const rows = $("[id$='_DGNotices'] tr[data-rowkey]");
      if (!rows.length) throw new Error("Kinder Morgan notice grid not found");
      const listings = rows.toArray().flatMap((row) => {
        const id = $(row).attr("data-rowkey")?.match(/^\[(\d+)\]$/)?.[1];
        if (!id) return [];
        const cells = $(row).children("td").children("div").children("table").children("tbody").children("tr").children("td");
        const read = (i: number) => cells.eq(i).text().trim();
        if (cells.length < 7 || !read(6)) throw new Error(`Unexpected notice row: ${id}`);
        return [{
          board, id, pipeline: boards[board].name, title: read(6), critical: type === "C",
          sourceType: [type === "P" ? "Planned service outage" : "", read(0), read(1)].filter(Boolean).join(" / "),
          postedAt: noticeDate(read(2)), effectiveFrom: noticeDate(read(3)), effectiveThrough: noticeDate(read(4)),
          sourceUrl: `${kinder}/Notices/NoticeDetail.aspx?code=${board}&notc_nbr=${id}`,
        }];
      });
      await mapLimited(listings, 4, (item) => collect(item.id, async () => {
        const detail = load(await (await request(item.sourceUrl)).text());
        if (!detail("[id$='_Label12']").length) throw new Error("Kinder Morgan notice body not found");
        return [{ ...item, ...noticeContent(detail, "[id$='_Label12']") }];
      }));
      return [];
    });
  }
}

async function scrapeTransfer(collect: Collect) {
  for (const section of ["critical", "non-critical", "planned-service-outage"]) {
    await collect(section, async () => {
      const $ = load(await (await request(`${transfer}/ipost/notice/${section}?asset=TW`)).text());
      const table = $("table").has("th.noticeId");
      if (!table.length) {
        // A section with no notices renders a header-less table holding a single "No Data to Display" cell.
        const empty = $("table td").filter((_, cell) => $(cell).text().trim() === "No Data to Display");
        if (empty.length) return [];
        throw new Error("Transwestern notice table not found");
      }
      await mapLimited(table.find("tbody tr").has("td.noticeId a").toArray(), 4, (row) => {
        const read = (field: string) => $(row).find(`td.${field}`).text().trim();
        const id = read("noticeId");
        return collect(id, async () => {
          const sourceUrl = new URL($(row).find("td.noticeId a").attr("href")!, transfer).href;
          const detail = load(await (await request(sourceUrl)).text());
          const bodyLabel = detail(".modal-body td").filter((_, cell) => {
            const label = detail(cell);
            return label.text().trim() === "Notice Text:" || label.children("p").first().text().trim() === "Notice Text:";
          }).first();
          if (!bodyLabel.length) throw new Error("Transwestern notice body not found");
          bodyLabel.next().attr("data-notice-body", "");
          const content = noticeContent(detail, "[data-notice-body]");
          const body = content.body || bodyLabel.parent().nextAll("tr").toArray().flatMap((row) => {
            const cells = detail(row).children("td");
            const label = cells.eq(0).text().trim();
            const value = cells.eq(1).text().trim();
            return value && (label === "Reason:" || label === "Location:") ? [`${label} ${value}`] : [];
          }).join("\n");
          return [{
            board: "TW", pipeline: boards.TW.name, id, title: read("subject"), ...content, body, sourceUrl,
            sourceType: section === "planned-service-outage" ? "Planned service outage" : read("type"),
            critical: section === "critical", postedAt: noticeDate(read("postingDate")),
            effectiveFrom: noticeDate(read("effectiveDate")), effectiveThrough: transwesternEndDate(read("endDate")),
          }];
        });
      });
      return [];
    });
  }
}

type LinkListing = { pipelineCode: string; pipelineName: string; notices: { noticeId: string }[] };
type LinkNotice = {
  "@Noticeid": string;
  NoticeTitle: string;
  NoticeTypeDescr: string;
  PostedDate: string;
  PostedTime: string;
  NoticeEffFromDate: string;
  NoticeEffFromTime: string;
  NoticeEffThruDate: string;
  NoticeEffThruTime: string;
  PostEffFromDate?: string;
  PostEffFromTime?: string;
  PostEffThruDate?: string;
  PostEffThruTime?: string;
  NoticeText?: { rawText?: string } | string;
};

function linkEffectiveThrough(record: LinkNotice) {
  const end = noticeDate(`${record.NoticeEffThruDate} ${record.NoticeEffThruTime}`);
  const postEnd = noticeDate(`${record.PostEffThruDate} ${record.PostEffThruTime}`);
  if (!end || end !== postEnd) return end;
  const postStart = noticeDate(`${record.PostEffFromDate} ${record.PostEffFromTime}`);
  if (!postStart) return end;
  const defaultPostEnd = DateTime.fromISO(postStart, { zone: centralZone }).plus({ days: 90 }).toUTC().toISO();
  return end === defaultPostEnd ? null : end;
}

// Enbridge has no per-notice endpoint: each pipeline response carries every critical notice from the
// last ~90 days with full HTML bodies (up to ~50 MB uncompressed), so it gets a longer budget and one retry,
// bounded by a board-wide deadline so LINK still saves inside the sweep's 300-second limit.
const linkBoardBudgetMs = 150_000;

async function linkPipelineNotices(code: string, deadline: number) {
  const url = `${enbridge}/api/notices?businessUnit=${code}&noticeType=CRI`;
  for (let attempt = 1; ; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("LINK sweep time budget exhausted");
    try {
      return await (await request(url, undefined, Math.min(60_000, remaining))).json() as
        { Notices?: { Notice?: LinkNotice | LinkNotice[] } };
    } catch (error) {
      if (attempt >= 2 || deadline - Date.now() <= 0) throw error;
    }
  }
}

async function scrapeLink(collect: Collect) {
  const deadline = Date.now() + linkBoardBudgetMs;
  await collect("critical listing", async () => {
    const index = await (await request(`${enbridge}/api/notices-listings?noticeType=CRI`)).json() as { pipelines: LinkListing[] };
    if (!Array.isArray(index.pipelines)) throw new Error("LINK pipelines missing from listing");
    await mapLimited(index.pipelines.filter((pipeline) => pipeline.notices.length), 2, (pipeline) => collect(pipeline.pipelineCode, async () => {
      const code = encodeURIComponent(pipeline.pipelineCode);
      const routeCode = encodeURIComponent(linkRouteCodes[pipeline.pipelineCode] ?? pipeline.pipelineCode);
      const response = await linkPipelineNotices(code, deadline);
      const records = [response.Notices?.Notice ?? []].flat();
      const byId = new Map(records.map((record) => [record["@Noticeid"], record]));
      for (const { noticeId } of pipeline.notices) {
        await collect(noticeId, async () => {
          const record = byId.get(noticeId);
          if (!record) throw new Error("LINK notice missing from pipeline response");
          return [{
            board: "LINK", id: noticeId, pipeline: pipeline.pipelineName, title: record.NoticeTitle,
            sourceType: record.NoticeTypeDescr, critical: true, postedAt: noticeDate(`${record.PostedDate} ${record.PostedTime}`),
            effectiveFrom: noticeDate(`${record.NoticeEffFromDate} ${record.NoticeEffFromTime}`),
            effectiveThrough: linkEffectiveThrough(record),
            sourceUrl: `${enbridge}/noticedetails/${routeCode}/CRI/${encodeURIComponent(noticeId)}`,
            ...contentFrom((typeof record.NoticeText === "string" ? record.NoticeText : record.NoticeText?.rawText) ?? ""),
          }];
        });
      }
      return [];
    }));
    return [];
  });
}

type WhiteWaterNotice = {
  NoticeId: number; NoticeSubject: string; NoticeSubType: string | null; NoticeCategoryDesc: string; NoticeText: string;
  PostDatetime: string; NoticeEffDatetime: string; NoticeEndDatetime: string; ActionURL: string;
};

async function scrapeWhiteWater(board: WhiteWaterBoard, collect: Collect) {
  const tspno = whitewaterTsps[board];
  for (const critical of ["Y", "N"]) {
    await collect(critical === "Y" ? "critical" : "non-critical", async () => {
      const pageSize = 100;
      for (let page = 1; ; page++) {
        const response = await request(`${whitewater}/NoticePosting/GetNoticePostings?tspno=${tspno}`, {
          method: "POST",
          headers: { "X-Requested-With": "XMLHttpRequest", Referer: `${whitewater}/NoticePosting?tspno=${tspno}&CriticalNoticeCode=${critical}` },
          body: new URLSearchParams({ CriticalNoticeCode: critical, page: String(page), pageSize: String(pageSize) }),
        });
        const result = await response.json() as { Data: WhiteWaterNotice[]; Total: number; Errors?: unknown };
        if (!Array.isArray(result.Data) || !Number.isSafeInteger(result.Total) || result.Errors) throw new Error("Unexpected WhiteWater notice response");
        for (const notice of result.Data) {
          await collect(String(notice.NoticeId), async () => [{
            board, pipeline: boards[board].name, id: String(notice.NoticeId), title: notice.NoticeSubject,
            sourceType: notice.NoticeSubType || notice.NoticeCategoryDesc || "", critical: critical === "Y", postedAt: noticeDate(notice.PostDatetime),
            effectiveFrom: noticeDate(notice.NoticeEffDatetime), effectiveThrough: noticeDate(notice.NoticeEndDatetime),
          sourceUrl: whitewaterPublicPages.has(board) ? new URL(notice.ActionURL, whitewater).href : "", ...contentFrom(notice.NoticeText ?? ""),
          }]);
        }
        if (page * pageSize >= result.Total) break;
        if (!result.Data.length) throw new Error("WhiteWater pagination ended early");
      }
      return [];
    });
  }
}

type NorthernNotice = {
  noticeId: string; noticeType: string; subject: string; postDateTime: string; effectiveDateTime: string; endDateTime: string; noticeHtml?: string; noticePointsHtml?: string;
};

async function northernList(path: string) {
  const result = await (await request(`${northern}/wp-json/api/notices/${path}`)).json() as { data?: { success?: boolean; data?: NorthernNotice[] } };
  if (!result.data?.success || !Array.isArray(result.data.data)) throw new Error("Unexpected Northern Natural notice response");
  return result.data.data;
}

async function scrapeNorthern(collect: Collect) {
  for (const path of ["critical", "non-critical"]) {
    await collect(path, async () => {
      await mapLimited(await northernList(path), 4, (notice) => collect(notice.noticeId, async () => {
        const [detail] = await northernList(notice.noticeId);
        const html = [detail?.noticeHtml, detail?.noticePointsHtml].filter(Boolean).join("\n");
        if (!html.trim()) throw new Error("Northern Natural notice body not found");
        return [{
          board: "NNG", pipeline: boards.NNG.name, id: notice.noticeId, title: notice.subject, sourceType: notice.noticeType,
          critical: path === "critical", postedAt: noticeDate(notice.postDateTime), effectiveFrom: noticeDate(notice.effectiveDateTime),
          effectiveThrough: noticeDate(notice.endDateTime), sourceUrl: `${northern}/notice-detail/?noticeId=${notice.noticeId}`,
          ...contentFrom(html),
        }];
      }));
      return [];
    });
  }
}

type DoubleENotice = { id: string | number; category: string; typeDesc: string; subject: string; startDate: string; content: string | null };

async function scrapeDoubleE(collect: Collect) {
  await collect("notices", async () => {
    const home = `${trellis}/home/infopost/doublee`;
    const cookie = (await request(home)).headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    if (!cookie.includes("JSESSIONID=")) throw new Error("Double E session cookie not found");
    const response = await request(`${trellis}/public/infopost/getNotifications.do?listOnly=true`, {
      method: "POST",
      headers: { Cookie: cookie, Referer: home, "X-Requested-With": "XMLHttpRequest", "Accept-Language": "en-US" },
      body: new URLSearchParams({
        gasDay: DateTime.now().setZone(centralZone).toFormat("MM/dd/yyyy"),
        "businessPartnerInfo.code": "9999", "businessPartnerInfo.id": "1", backboneId: "22059", tspId: "2",
      }),
    });
    const result = await response.json() as { dataList?: DoubleENotice[] };
    if (!Array.isArray(result.dataList)) throw new Error("Unexpected Double E notice response");
    return result.dataList.map((notice) => {
      const postedAt = noticeDate(notice.startDate.replace(" ", "T"));
      return {
        board: "DE" as const, pipeline: boards.DE.name, id: String(notice.id), title: notice.subject, sourceType: notice.typeDesc,
        critical: notice.category === "Critical", postedAt, effectiveFrom: postedAt, effectiveThrough: null, sourceUrl: home,
        ...contentFrom(notice.content ?? ""),
      };
    });
  });
}

export async function scrapeBoard(board: BoardId): Promise<Result> {
  const notices: RawNotice[] = [];
  const errors: string[] = [];
  const collect: Collect = async (label, run) => {
    try {
      notices.push(...await run());
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  if (board === "LINK") await scrapeLink(collect);
  else if (board === "TW") await scrapeTransfer(collect);
  else if (isWhiteWater(board)) await scrapeWhiteWater(board, collect);
  else if (board === "NNG") await scrapeNorthern(collect);
  else if (board === "DE") await scrapeDoubleE(collect);
  else await scrapeKinder(board, collect);
  return { notices, errors };
}

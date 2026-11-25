import { load, type CheerioAPI } from "cheerio";
import { DateTime } from "luxon";
import { boards, type BoardId, type RawNotice } from "./model";
import { centralZone, noticeDate, transwesternEndDate } from "./normalize";

type Result = { notices: RawNotice[]; errors: string[] };
type Collect = (label: string, run: () => Promise<RawNotice[]>) => Promise<void>;
type KinderBoard = "EPNG" | "NGPL" | "GCX" | "PHP";

const kinder = "https://pipeline2.kindermorgan.com";
const transfer = "https://twtransfer.energytransfer.com";
const enbridge = "https://infopost.enbridge.com";
const carlsbad = "https://web-prd.myquorumcloud.com/WWMPA1IPWS";
const linkRouteCodes: Record<string, string> = { AGT: "AG", EHP: "EG", ETNG: "ET", MBHP: "MB", SGSC: "SG" };

export async function mapLimited<T>(items: readonly T[], concurrency: number, run: (item: T) => Promise<void>) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) await run(items[index++]);
  }));
}

async function request(url: string, options?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000), ...options });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${new URL(url).hostname}: ${reason}`);
  }
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  return response;
}

function plainText($: CheerioAPI, selector: string) {
  const content = $(selector).clone();
  content.find("script, style, head, title, noscript").remove();
  content.find("br").replaceWith("\n");
  content.find("p, div, li, pre, tr").after("\n");
  content.find("td, th").after("  ");
  return content.text().replace(/\r\n?/g, "\n").split("\n")
    .map((line) => line.replace(/[\t\u00a0 ]+/g, " ").trim())
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function textFrom(value: string) {
  if (!/<\/?(?:html|body|p|div|br|table|span|b|font|td|ul|a)\b/i.test(value)) return value.trim();
  return plainText(load(value), "body");
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
        return [{ ...item, body: plainText(detail, "[id$='_Label12']") }];
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
      if (!table.length) throw new Error("Transwestern notice table not found");
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
          const body = plainText(detail, "[data-notice-body]") || bodyLabel.parent().nextAll("tr").toArray().flatMap((row) => {
            const cells = detail(row).children("td");
            const label = cells.eq(0).text().trim();
            const value = cells.eq(1).text().trim();
            return value && (label === "Reason:" || label === "Location:") ? [`${label} ${value}`] : [];
          }).join("\n");
          return [{
            board: "TW", pipeline: boards.TW.name, id, title: read("subject"), body, sourceUrl,
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

async function scrapeLink(collect: Collect) {
  await collect("critical listing", async () => {
    const index = await (await request(`${enbridge}/api/notices-listings?noticeType=CRI`)).json() as { pipelines: LinkListing[] };
    if (!Array.isArray(index.pipelines)) throw new Error("LINK pipelines missing from listing");
    await mapLimited(index.pipelines.filter((pipeline) => pipeline.notices.length), 4, (pipeline) => collect(pipeline.pipelineCode, async () => {
      const code = encodeURIComponent(pipeline.pipelineCode);
      const routeCode = encodeURIComponent(linkRouteCodes[pipeline.pipelineCode] ?? pipeline.pipelineCode);
      const response = await (await request(`${enbridge}/api/notices?businessUnit=${code}&noticeType=CRI`)).json() as
        { Notices?: { Notice?: LinkNotice | LinkNotice[] } };
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
            body: textFrom((typeof record.NoticeText === "string" ? record.NoticeText : record.NoticeText?.rawText) ?? ""),
          }];
        });
      }
      return [];
    }));
    return [];
  });
}

type CarlsbadNotice = {
  NoticeId: number; NoticeSubject: string; NoticeSubType: string | null; NoticeCategoryDesc: string; NoticeText: string;
  PostDatetime: string; NoticeEffDatetime: string; NoticeEndDatetime: string; ActionURL: string;
};

async function scrapeCarlsbad(collect: Collect) {
  for (const critical of ["Y", "N"]) {
    await collect(critical === "Y" ? "critical" : "non-critical", async () => {
      const pageSize = 100;
      for (let page = 1; ; page++) {
        const response = await request(`${carlsbad}/NoticePosting/GetNoticePostings?tspno=701`, {
          method: "POST",
          headers: { "X-Requested-With": "XMLHttpRequest", Referer: `${carlsbad}/NoticePosting?tspno=701&CriticalNoticeCode=${critical}` },
          body: new URLSearchParams({ CriticalNoticeCode: critical, page: String(page), pageSize: String(pageSize) }),
        });
        const result = await response.json() as { Data: CarlsbadNotice[]; Total: number; Errors?: unknown };
        if (!Array.isArray(result.Data) || !Number.isSafeInteger(result.Total) || result.Errors) throw new Error("Unexpected Carlsbad notice response");
        for (const notice of result.Data) {
          await collect(String(notice.NoticeId), async () => [{
            board: "CG", pipeline: boards.CG.name, id: String(notice.NoticeId), title: notice.NoticeSubject,
            sourceType: notice.NoticeSubType || notice.NoticeCategoryDesc || "", critical: critical === "Y", postedAt: noticeDate(notice.PostDatetime),
            effectiveFrom: noticeDate(notice.NoticeEffDatetime), effectiveThrough: noticeDate(notice.NoticeEndDatetime),
            sourceUrl: new URL(notice.ActionURL, carlsbad).href, body: textFrom(notice.NoticeText ?? ""),
          }]);
        }
        if (page * pageSize >= result.Total) break;
        if (!result.Data.length) throw new Error("Carlsbad pagination ended early");
      }
      return [];
    });
  }
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
  else if (board === "CG") await scrapeCarlsbad(collect);
  else await scrapeKinder(board, collect);
  return { notices, errors };
}

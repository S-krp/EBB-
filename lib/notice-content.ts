import { load, type CheerioAPI } from "cheerio";
import type { NoticeBlock } from "./model";

export function plainText($: CheerioAPI, selector: string) {
  const content = $(selector).clone();
  content.find("script, style, head, title, noscript").remove();
  content.find("br").replaceWith("\n");
  content.find("p, div, li, pre, tr").after("\n");
  content.find("td, th").after("  ");
  return content.text().replace(/\r\n?/g, "\n").split("\n")
    .map((line) => line.replace(/[\t\u00a0 ]+/g, " ").trim())
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Keep only data, never upstream markup, styles, URLs or event handlers.
export function noticeContent($: CheerioAPI, selector: string): { body: string; bodyBlocks?: NoticeBlock[] } {
  const body = plainText($, selector);
  const content = $(selector).clone();
  content.find("script, style, head, title, noscript").remove();
  const tables = content.find("table").filter((_, table) => !$(table).parentsUntil(content).filter("table").length);
  if (!tables.length) return { body };
  const blocks: NoticeBlock[] = [];
  // A delimiter absent from the source keeps the surrounding prose in order.
  let delimiter = "EBB_TABLE_BLOCK";
  while (body.includes(delimiter)) delimiter += "_";
  const tableBlocks: NoticeBlock[] = [];
  tables.each((index, table) => {
    const span = (value: string | undefined) => Math.max(1, Math.min(100, Number.parseInt(value || "1", 10) || 1));
    const rows = $(table).find("tr").filter((_, row) => $(row).closest("table")[0] === table).toArray().map((row) =>
      $(row).children("td, th").toArray().map((cell) => {
        const fragment = load("<div data-cell></div>");
        fragment("[data-cell]").append($(cell).html() || "");
        return {
          text: plainText(fragment, "[data-cell]"),
          header: cell.tagName === "th" || $(cell).find("b, strong").length > 0,
          colSpan: span($(cell).attr("colspan")), rowSpan: span($(cell).attr("rowspan")),
        };
      }),
    ).filter((row) => row.length);
    tableBlocks.push({ type: "table", rows });
    $(table).replaceWith(`\n${delimiter}${index}${delimiter}\n`);
  });
  const fragment = load("<div data-content></div>");
  fragment("[data-content]").append(content);
  const text = plainText(fragment, "[data-content]");
  const parts = text.split(new RegExp(`${delimiter}(\\d+)${delimiter}`));
  parts.forEach((part, index) => {
    if (index % 2) blocks.push(tableBlocks[Number(part)]);
    else if (part.trim()) blocks.push({ type: "text", text: part.trim() });
  });
  return { body, bodyBlocks: blocks };
}

export function contentFrom(value: string) {
  if (!/<\/?(?:html|body|p|div|br|table|span|b|font|td|ul|a)\b/i.test(value)) return { body: value.trim() };
  return noticeContent(load(value), "body");
}

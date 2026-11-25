import { boardIds, categories, type BoardId, type Category, type Notice } from "./model";
import { matchesPid, parsePids } from "../v2/lib/notice-pids.mjs";

export type NoticeFilters = {
  query: string;
  pidQuery: string;
  pipelines: BoardId[];
  types: Category[];
  criticalOnly: boolean;
  range: { start: string; end: string };
};

export const emptyNoticeFilters: NoticeFilters = {
  query: "",
  pidQuery: "",
  pipelines: [],
  types: [],
  criticalOnly: false,
  range: { start: "", end: "" },
};

const categorySearchText: Record<Category, string> = {
  OFO: "OFO operational flow order",
  "Force Majeure": "Force Majeure fm",
  Maintenance: "Maintenance maint",
  Critical: "Critical crit",
  "Non-Critical": "",
};
const nonCriticalTerm = "noncritical";
const nonCriticalPhrase = /\bnon(?:[ \t]+|-)critical\b/g;

const centralDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
});

function postedDate(postedAt: string | null) {
  if (!postedAt) return "";
  const date = new Date(postedAt);
  if (Number.isNaN(date.getTime())) return "";
  const parts = centralDate.formatToParts(date);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

export function indexNotices(notices: Notice[]) {
  return notices.map((notice) => {
    const text = [
      notice.title, notice.body, notice.id, notice.pipeline, notice.board,
      categorySearchText[notice.category], notice.critical ? "critical" : "",
      notice.emergency ? "emergency" : "",
    ].join("\n").toLowerCase();
    return {
      notice,
      date: postedDate(notice.postedAt),
      hasNonCriticalTerm: notice.category === "Non-Critical" || text.search(nonCriticalPhrase) !== -1,
      text,
    };
  });
}

export function hasInvertedRange({ start, end }: NoticeFilters["range"]) {
  return !!(start && end && start > end);
}

export function filterNotices(index: ReturnType<typeof indexNotices>, filters: NoticeFilters) {
  const { query, pidQuery, pipelines, types, criticalOnly, range } = filters;
  if (hasInvertedRange(range)) return [];
  const terms = query.toLowerCase().replace(nonCriticalPhrase, nonCriticalTerm).trim().split(/\s+/).filter(Boolean);
  const pids = parsePids(pidQuery);
  const matches: Notice[] = [];
  for (const { notice, date, text, hasNonCriticalTerm } of index) {
    if (pipelines.length && !pipelines.includes(notice.board)) continue;
    if (types.length && !types.includes(notice.category)) continue;
    if (criticalOnly && !notice.critical) continue;
    if ((range.start || range.end) && (!date || (range.start && date < range.start) || (range.end && date > range.end))) continue;
    if (!matchesPid(notice, pids)) continue;
    if (terms.every((term) => text.includes(term) || (hasNonCriticalTerm && term === nonCriticalTerm))) matches.push(notice);
  }
  return matches;
}

function dateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return "";
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

export function readNoticeFilters(params: URLSearchParams): NoticeFilters {
  const pipelines = params.getAll("pipeline");
  const types = params.getAll("type");
  return {
    query: params.get("q") ?? "",
    pidQuery: params.get("pid") ?? "",
    pipelines: boardIds.filter((board) => pipelines.includes(board)),
    types: categories.filter((category) => types.includes(category)),
    criticalOnly: params.get("critical") === "1",
    range: { start: dateParam(params.get("from")), end: dateParam(params.get("through")) },
  };
}

export function writeNoticeFilters(params: URLSearchParams, filters: NoticeFilters) {
  for (const key of ["q", "pid", "pipeline", "type", "critical", "from", "through"]) params.delete(key);
  if (filters.query) params.set("q", filters.query);
  if (filters.pidQuery) params.set("pid", filters.pidQuery);
  for (const pipeline of filters.pipelines) params.append("pipeline", pipeline);
  for (const type of filters.types) params.append("type", type);
  if (filters.criticalOnly) params.set("critical", "1");
  if (filters.range.start) params.set("from", filters.range.start);
  if (filters.range.end) params.set("through", filters.range.end);
}

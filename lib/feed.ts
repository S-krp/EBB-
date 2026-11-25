import { createHash } from "node:crypto";
import type { BoardStatus, Notice } from "./model";

export type FeedQuery = { boards: string[]; categories: string[] };

export function readFeedQuery(params: URLSearchParams): FeedQuery {
  return { boards: params.getAll("board"), categories: params.getAll("category") };
}

export function filterFeed(notices: Notice[], { boards, categories }: FeedQuery) {
  if (!boards.length && !categories.length) return notices;
  return notices.filter((notice) =>
    (!boards.length || boards.includes(notice.board)) && (!categories.length || categories.includes(notice.category)));
}

export function feedEtag(revision: string, status: BoardStatus[], nextSweep: string, query: FeedQuery) {
  const digest = createHash("sha256").update(JSON.stringify([revision, status, nextSweep, query])).digest("base64url");
  return `"${digest.slice(0, 27)}"`;
}

export function etagMatches(header: string | null, etag: string) {
  if (!header) return false;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, "");
  return header.split(",").some((tag) => tag.trim() === "*" || opaque(tag) === opaque(etag));
}

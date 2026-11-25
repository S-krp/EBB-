import type { Notice } from "./model";

export function isLifted(notice: Pick<Notice, "title">) {
  return /\b(lifted|rescinded|cancell?ed|terminated|no longer in effect)\b/i.test(notice.title);
}

export function countNonLiftedOfos(notices: readonly Pick<Notice, "category" | "title">[]) {
  return notices.filter((notice) => notice.category === "OFO" && !isLifted(notice)).length;
}

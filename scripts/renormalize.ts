import { existsSync } from "node:fs";
import { readFeed, updateCachedNotice } from "../lib/db";
import { normalize, transwesternEndDate } from "../lib/normalize";

for (const path of [".env.local", ".env"]) {
  if (existsSync(path)) process.loadEnvFile(path);
}

async function renormalize() {
  const { notices } = await readFeed();
  let updated = 0;
  for (const notice of notices) {
    const end = notice.board === "TW" ? transwesternEndDate(notice.effectiveThrough) : notice.effectiveThrough;
    if (notice.board !== "LINK" && end === notice.effectiveThrough) continue;
    const next = normalize({ ...notice, critical: notice.board === "LINK" || notice.critical, effectiveThrough: end });
    if (await updateCachedNotice(notice.hash, next)) updated++;
  }
  console.log(`Re-normalized ${updated} stored notices.`);
}

renormalize().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

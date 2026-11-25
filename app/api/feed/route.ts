import { readFeedVersion, readNotices } from "../../../lib/db";
import { etagMatches, feedEtag, filterFeed, readFeedQuery } from "../../../lib/feed";
import { nextSweep } from "../../../lib/schedule";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = readFeedQuery(new URL(request.url).searchParams);
    const { revision, status } = await readFeedVersion();
    const next = nextSweep();
    const headers = { "Cache-Control": "no-cache", ETag: feedEtag(revision, status, next, query) };
    if (etagMatches(request.headers.get("if-none-match"), headers.ETag)) return new Response(null, { status: 304, headers });
    const notices = filterFeed(await readNotices(revision), query);
    return Response.json({ notices, status, nextSweep: next }, { headers });
  } catch (error) {
    console.error("Could not read EBB feed", error);
    return Response.json({ error: "Could not load the notice database." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

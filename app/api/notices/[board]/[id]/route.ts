import { readNoticeBlocks } from "../../../../../lib/db";
import { boardIds, type BoardId } from "../../../../../lib/model";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ board: string; id: string }> }) {
  const { board, id } = await context.params;
  const params = new URL(request.url).searchParams;
  const pipeline = params.get("pipeline"), hash = params.get("hash");
  if (!boardIds.includes(board as BoardId) || !pipeline || !hash) return Response.json({ error: "Invalid notice." }, { status: 400 });
  try {
    const content = await readNoticeBlocks(board as BoardId, pipeline, id);
    // Never combine a newer table with dates and prose from an older feed snapshot.
    if (content && content.hash !== hash) return Response.json({ error: "Notice changed. Reopen it from the refreshed feed." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    return Response.json(content ? { bodyBlocks: content.bodyBlocks } : { error: "Notice not found." }, {
      status: content ? 200 : 404, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Could not load formatted notice", error);
    return Response.json({ error: "Could not load the formatted notice." }, { status: 503 });
  }
}

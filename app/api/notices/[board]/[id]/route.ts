import { readNoticeBlocks } from "../../../../../lib/db";
import { boardIds, type BoardId } from "../../../../../lib/model";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ board: string; id: string }> }) {
  const { board, id } = await context.params;
  const pipeline = new URL(request.url).searchParams.get("pipeline");
  if (!boardIds.includes(board as BoardId) || !pipeline) return Response.json({ error: "Invalid notice." }, { status: 400 });
  try {
    const content = await readNoticeBlocks(board as BoardId, pipeline, id);
    return Response.json(content ?? { error: "Notice not found." }, {
      status: content ? 200 : 404, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Could not load formatted notice", error);
    return Response.json({ error: "Could not load the formatted notice." }, { status: 503 });
  }
}

import { readFeed } from "../../../lib/db";
import { nextSweep } from "../../../lib/schedule";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ ...await readFeed(), nextSweep: nextSweep() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not read EBB feed", error);
    return Response.json({ error: "Could not load the notice database." }, { status: 503 });
  }
}

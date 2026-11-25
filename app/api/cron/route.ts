import { timingSafeEqual } from "node:crypto";
import { scheduledSweepSlot } from "../../../lib/schedule";
import { sweep } from "../../../lib/sweep";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const slot = scheduledSweepSlot();
  if (!slot) return Response.json({ skipped: "Outside the scheduled Central hour." });
  try {
    const status = await sweep({ slot });
    return Response.json(status ? { status } : { skipped: "A sweep is already running or completed this hour." });
  } catch (error) {
    console.error("Cron EBB sweep failed", error);
    return Response.json({ error: "Could not complete the sweep." }, { status: 503 });
  }
}

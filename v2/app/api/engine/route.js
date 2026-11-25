import { cycleClock } from "../../../lib/cycles.mjs";
import { engine } from "../../../lib/engine.mjs";
import { solve } from "../../../lib/solver.mjs";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    return Response.json({ ...await engine().read(), cycles: cycleClock() }, { headers });
  } catch {
    return Response.json({ error: "The corridor graph is unavailable. Check the server graph configuration." }, { status: 503, headers });
  }
}

export async function POST(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid solver request." }, { status: 400, headers });
  }
  try {
    const snapshot = await engine().read();
    const now = new Date();
    const notices = snapshot.notices
      .filter(({ effectiveThrough }) => !(Date.parse(effectiveThrough) < now))
      .map((notice) => ({ ...notice, upcoming: Date.parse(notice.effectiveFrom) > now }));
    return Response.json({
      ...snapshot, cycles: cycleClock(now),
      result: solve(snapshot.graph, input, notices),
    }, { headers });
  } catch (error) {
    const invalid = error instanceof RangeError;
    return Response.json({ error: invalid ? error.message : "Could not solve with the current corridor graph." },
      { status: invalid ? 400 : 503, headers });
  }
}

import { sweep, SweepCooldown } from "../../../lib/sweep";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const status = await sweep({ manual: true });
    return status ? Response.json({ status }) : Response.json({ error: "A sweep is already running." }, { status: 409 });
  } catch (error) {
    if (error instanceof SweepCooldown) {
      return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfter) } });
    }
    console.error("Manual EBB sweep failed", error);
    return Response.json({ error: "Could not complete the sweep." }, { status: 503 });
  }
}

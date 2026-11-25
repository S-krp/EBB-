import { sweep } from "../../../lib/sweep";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const status = await sweep();
    return status ? Response.json({ status }) : Response.json({ error: "A sweep is already running." }, { status: 409 });
  } catch (error) {
    console.error("Manual EBB sweep failed", error);
    return Response.json({ error: "Could not complete the sweep." }, { status: 503 });
  }
}

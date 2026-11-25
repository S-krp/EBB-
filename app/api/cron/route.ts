import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { scheduledSweepSlot } from "../../../lib/schedule";
import { sweep } from "../../../lib/sweep";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const issuer = "https://token.actions.githubusercontent.com";
const audience = "https://ebb-watch.vercel.app";
const githubKeys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));

async function isAuthorized(authorization: string | null) {
  const token = /^Bearer (\S+)$/i.exec(authorization ?? "")?.[1];
  if (!token) return false;

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = Buffer.from(token);
    const expected = Buffer.from(secret);
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) return true;
  }

  try {
    const { payload } = await jwtVerify(token, githubKeys, {
      issuer,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp"],
    });
    return payload.repository === "S-krp/EBB-" && payload.ref === "refs/heads/main";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!await isAuthorized(request.headers.get("authorization"))) {
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

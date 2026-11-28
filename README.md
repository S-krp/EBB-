# EBB Watch

A dark-mode natural gas operations dashboard for notices published on public pipeline Electronic Bulletin Boards. Use the table or card layout, search the title or notice body, filter by board, type and posted date, and open any notice to see its full text and original posting.

## Run locally

Requires Node.js 22.13 or newer (Node 24 recommended).

```sh
npm ci
npm run sweep       # initial live ingestion; optional if you use Run sweep in the UI
npm run dev         # http://localhost:3000
```

No variables are required for local development. SQLite defaults to `.data/notices.sqlite`; the app creates its tables automatically. To run the production build locally: `npm run build && npm start`.

Boards are independent: an upstream failure is shown in Board Status without clearing notices or the last successful sweep. A healthy board can report zero notices. The feed refreshes every minute, and **Run sweep** starts the same live job available from `npm run sweep`. `/api/feed` sends an `ETag`, so a refresh with no new sweep gets an empty `304 Not Modified` and the database is only read in full when notices change. Pass `board` and `category` (repeatable, e.g. `?category=OFO`) to fetch a subset. A successful sweep deletes a board's notices that are no longer posted on it once both their posted date and their end date are more than 90 days old; undated and open-ended notices are kept.

## Sources and coverage

| Board | Public source and scope |
| --- | --- |
| EPNG, NGPL, GCX, PHP | Kinder Morgan public DART informational postings: Critical, Non-Critical, and Planned Service Outage; the first window rendered by each board's notice grid |
| Enbridge LINK | LINK's public current Critical Notices listing and the per-pipeline notice body endpoint |
| Transwestern | Energy Transfer iPost Critical, Non-Critical, and Planned Service Outage; current public listings |
| Carlsbad Gateway, Agua Blanca, Matterhorn Express, Waha Gas Storage | WhiteWater's public Quorum Critical and Non-Critical notices with pagination (TSP 701, 401, 502 and 801) |
| Double E | The public Trellis infopost notice list, read with the anonymous session cookie the home page sets |
| Northern Natural Gas | Public Critical and Non-Critical notice JSON, with each notice body from its detail endpoint |

No login-walled boards are queried. The scraper captures the published inline text, not binary attachments; the original link is included for verification. Source timestamps without offsets are interpreted as Central Time. Notices are keyed by board, pipeline and notice ID; rows are only rewritten when their SHA-256 hash or derived fields change.

After upgrading an existing database, run `npm run renormalize` once to refresh stored LINK and Transwestern notices that are no longer listed by their boards. Current listings are refreshed by the next sweep.

## Deploy

Settings are documented in [`.env.example`](.env.example). Build checks: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

### Railway (Docker)

1. Deploy this GitHub repository as a service. Railway uses `railway.json` and the included `Dockerfile`.
2. Attach a Railway PostgreSQL service and set `DATABASE_URL` to its connection string. Alternatively, for a single replica, mount a volume at `/app/.data` and leave `DATABASE_URL` unset. Persist the volume across deployments and make it writable by the container's `node` user.
3. Under **Networking**, generate a Railway domain; no custom domain is required. Open it and click **Run sweep** to populate a new database. The in-process schedule is enabled by default.

### Vercel

1. Import this repository as two Next.js projects with Node.js 24. Use the repository root for **EBB Watch (v1)** and `v2` as the Root Directory for **Permian Flow (v2)**. Keep Vercel's system environment variables available and use the public production `.vercel.app` domains, without deployment authentication on those domains.
2. For **v1**, in the Production environment set `DATABASE_URL` (or `POSTGRES_URL`) to a persistent PostgreSQL connection string; use a pooled URL if available. The app creates its tables on first use. SQLite is not supported on Vercel. Set a strong random `CRON_SECRET`; Vercel sends it as an Authorization Bearer token to `/api/cron`. Fluid compute is enabled to allow up to five minutes for a sweep. Deploy v1, then use **Run sweep** to populate the database and check that `/api/feed` returns JSON without signing in.
3. For **v2**, set `V1_NOTICE_FEED_URL` in the Production environment to `https://<v1-production-domain>/api/feed`, then deploy. No Neo4j or capacity feed is required. See [v2's README](v2/README.md) for optional settings.

Sweeps run in the **09:00, 13:00, 18:00, and 22:00 America/Chicago** hours. The Railway/Node worker uses the timezone directly. Vercel uses one daily cron entry per candidate UTC hour, which fits [Hobby's once-daily cron limit](https://vercel.com/docs/cron-jobs/usage-and-pricing). Hobby can start a job anywhere within the hour. The **Scheduled EBB sweep** GitHub Actions workflow independently calls the production cron endpoint at minute 7 of each of those hours. It uses a short-lived GitHub OIDC token for `S-krp/EBB-` on `main`; no repository secret is needed. The workflow can also be dispatched manually from `main`, but the endpoint still skips requests outside the scheduled hours. The database prevents overlapping runs and skips a second scheduled sweep once the current slot is complete.

The dashboard and manual sweep button are public by default; configure deployment-level access controls before exposing a private instance.

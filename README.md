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

Boards are independent: an upstream failure is shown in Board Status without clearing notices or the last successful sweep. A healthy board can report zero notices. The feed refreshes every minute, and **Run sweep** starts the same live job available from `npm run sweep`.

## Sources and coverage

| Board | Public source and scope |
| --- | --- |
| EPNG, NGPL, GCX, PHP | Kinder Morgan public DART informational postings: Critical, Non-Critical, and Planned Service Outage; the first window rendered by each board's notice grid |
| Enbridge LINK | LINK's public current Critical Notices listing and the per-pipeline notice body endpoint |
| Transwestern | Energy Transfer iPost Critical, Non-Critical, and Planned Service Outage; current public listings |
| Carlsbad Gateway | WhiteWater's public Quorum Critical and Non-Critical notices with pagination |

No login-walled boards are queried. The scraper captures the published inline text, not binary attachments; the original link is included for verification. Source timestamps without offsets are interpreted as Central Time. Notices are keyed by board, pipeline and notice ID; a SHA-256 content hash prevents unchanged notices from being rewritten.

After upgrading an existing database, run `npm run renormalize` once to refresh stored LINK and Transwestern notices that are no longer listed by their boards. Current listings are refreshed by the next sweep.

## Deploy

Settings are documented in [`.env.example`](.env.example). Build checks: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

### Railway (Docker)

1. Deploy this GitHub repository as a service. Railway uses `railway.json` and the included `Dockerfile`.
2. Attach a Railway PostgreSQL service and set `DATABASE_URL` to its connection string. Alternatively, for a single replica, mount a volume at `/app/.data` and leave `DATABASE_URL` unset. Persist the volume across deployments and make it writable by the container's `node` user.
3. Under **Networking**, generate a Railway domain; no custom domain is required. Open it and click **Run sweep** to populate a new database. The in-process schedule is enabled by default.

### Vercel

1. Import the repository as a Next.js project with Node.js 24. Set `DATABASE_URL` to persistent PostgreSQL (use its pooled connection URL if provided), and set a strong random `CRON_SECRET`. SQLite does not persist on Vercel and is not supported there.
2. Deploy to the default `.vercel.app` domain and click **Run sweep** to populate the database.
3. Production scheduled deployments require a plan that supports more than one cron invocation per day (such as Vercel Pro). On a plan that does not, remove the cron entry and run sweeps manually or use Railway.

Sweeps run at **09:00, 13:00, 18:00, and 22:00 America/Chicago**. The Railway/Node worker uses the timezone directly. Vercel schedules both UTC offsets and the authenticated endpoint skips the one that does not match Central local time, including on DST transitions. A database lease prevents overlapping manual and scheduled runs.

The dashboard and manual sweep button are public by default; configure deployment-level access controls before exposing a private instance.

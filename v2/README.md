# Permian Flow & EBB Arbitrage Engine · v2

[Executive pitch](../docs/v2-pitch.md)

From `v2/` with Node.js 22.13+ (Node 24 recommended):

```sh
npm ci
npm test
npm run build
npm start
```

Open [http://localhost:3001](http://localhost:3001). This runs separately from v1 on port 3000. Select an origin, enter the supply and destination prices in $/Dth and a desired delivered volume in Dth/day, and click **Compare routes**. Try the default scenario, then raise the volume to 100,000 to see constrained alternatives. The map highlights the best-netback route when one exists.

## What is modeled

- The sample network covers Delaware Basin, Waha, Agua Dulce, Katy-area storage, Katy and Houston Ship Channel. Topology (including connectors and storage), tariffs, fuel fractions and any unreported capacities are **illustrative**, not nomination or trading inputs.
- The solver prices a single directed path at a time. It grosses up from delivered volumes by each segment's fuel retention, charges each tariff on segment inlet volume, and compares required inlet flow with that segment’s OAC. Delivered cost is total gas purchase plus transport divided by delivered volume. Netback is downstream revenue minus transport divided by origin inlet volume (the break-even origin price). Neither split flows nor contractual entitlements are modeled.
- Nomination deadlines use America/Chicago local time and follow [FERC Order No. 809](https://www.federalregister.gov/d/2015-09275): Timely 1:00 p.m. and Evening 6:00 p.m. (next gas day); ID1 10:00 a.m., ID2 2:30 p.m., ID3 7:00 p.m. (same gas day). The gas day starts at 9:00 a.m. Central. Verify operator-specific deadlines before scheduling.

## Optional services

Copy `.env.example` to `.env.local` and uncomment only the settings you need.

- **Notices** — v2 reuses v1’s scraper output through the existing EBB Watch `/api/feed` (default: the EBB Watch preview). Set `V1_NOTICE_FEED_URL` to use another instance, or set it empty to disable. OFOs are board-level cautions, not location-specific blocks. Route results flag matching current, upcoming (with start time) and undated OFOs without treating them as capacity cuts. Explicitly expired notices are excluded. Missing, errored or older-than-12-hour board statuses are shown as incomplete coverage.
- **Capacity** — v1's notice scrapers do not provide point-level OAC or scheduled volumes. Set `OAC_FEED_URL` to a trusted, normalized JSON source providing exact segment IDs, Dth/day and observation timestamps. This app does not scrape OAC posts itself. Each segment keeps its newest observation for up to 12 hours, even if a feed refresh replays or omits it; otherwise the segment uses visibly illustrative capacity. Scheduled volumes are shown but not subtracted from OAC a second time. Example:

  ```json
  {
    "segments": [
      {
        "edgeId": "php-katy",
        "oac": 65000,
        "scheduledVolume": 18000,
        "asOf": "2026-11-24T18:00:00Z",
        "sourceUrl": "https://example.com/operator-capacity-post"
      }
    ]
  }
  ```

  Seeded segment IDs: `del-waha`, `php-katy`, `gcx-agua`, `agua-hsc`, `katy-hsc`, `waha-storage`, `storage-katy`.
- **Alerts** — On refresh the engine logs newly observed OFOs and changes between successive reported OAC observations (first observation establishes a baseline). Set `ALERT_WEBHOOK_URL` to POST each alert as JSON to a trusted receiver. This enables a one-minute background refresh in a persistent Node process; `V2_BACKGROUND_REFRESH=true` also enables background dry-run logging without a webhook. Otherwise refreshes occur on demand, at most once a minute under normal operation. Delivery retries and deduplication are in memory for a single instance, so restarts can replay OFOs or lose undelivered alerts. Use a receiver that deduplicates by alert ID. Messaging platforms requiring platform-specific payloads need an adapter.
- **Graph** — In-memory by default. Set `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, and optionally `NEO4J_DATABASE` to seed and read the same corridor in Neo4j. The account needs write access to seed v2's dedicated point/segment labels; existing properties are not overwritten. The OAC overlay remains in memory. No hosted Neo4j or real tariff data is required to try the app.

# Permian Flow & EBB Arbitrage Engine · v2

[Executive pitch](../docs/v2-pitch.md)

From `v2/` with Node.js 22.13+ (Node 24 recommended):

```sh
npm ci
npm test
npm run build
npm start
```

Open [http://localhost:3001](http://localhost:3001). This runs separately from v1 on port 3000. Select an origin, enter the supply and destination prices in $/Dth and a desired delivered volume in Dth/day, and click **Compare routes**. The routing desk shows the cheapest candidate to each destination that is not ruled out by reported OAC, plus origin inlet volume and retained fuel for each path. The map highlights the best-netback candidate. Rankings flag missing OAC rather than presenting those routes as confirmed fits.

## What is modeled

- The schematic covers Agua Blanca's Delaware Basin system into Waha, PHP from Waha to Katy Oasis or HPL at Lockhart, GCX from Waha to Tejas at Agua Dulce, and an HPL scenario from Lockhart to the Houston Ship Channel Pool. These are selected public points and system links, not a complete point catalog or confirmation that any shipper can use the full path.
- The solver prices a single directed path at a time. It grosses up from delivered volumes by each segment's scenario fuel retention, applies the maximum public interruptible tariff to modeled inlet volume, and compares required inlet flow with the segment's OAC when available. Delivered cost is total gas purchase plus transport divided by delivered volume. Netback is downstream revenue minus transport divided by origin inlet volume (the break-even origin price). This is not a billing model; taxes, other fees, firm reservation charges, split flows and contractual entitlements are not modeled.
- Nomination deadlines use America/Chicago local time and follow [FERC Order No. 809](https://www.federalregister.gov/d/2015-09275): Timely 1:00 p.m. and Evening 6:00 p.m. (next gas day); ID1 10:00 a.m., ID2 2:30 p.m., ID3 7:00 p.m. (same gas day). The gas day starts at 9:00 a.m. Central. Verify operator-specific deadlines before scheduling.

## Public source audit

The rate inputs use the **NGPA Section 311 maximum interruptible transportation rate**, not a negotiated quote or firm demand rate. One Dth equals one MMBtu. Fuel is the published cap where retention varies; the highest published cap is a comparison assumption, not evidence that a specific shipper qualifies for that tier.

| Segment | Public topology | Published transport and fuel basis | System capacity context, not OAC |
| --- | --- | --- | --- |
| Agua Blanca: Delaware to Waha | [WhiteWater operations](https://www.whitewatermidstream.com/operations), [WhiteWater map via Oil & Gas Journal](https://www.ogj.com/pipelines-transportation/article/14187326/whitewater-mplx-complete-agua-blanca-permian-gas-gathering-expansion) | [FERC SOC v0.2.0, Ex. B](https://etariff.ferc.gov/TariffBrowser.aspx?tid=5999): $0.1950/Dth, actual fuel capped at 0.75%, updated monthly | About 3.5 Bcf/day ([operator](https://www.whitewatermidstream.com/operations)) |
| PHP: Waha to Katy Oasis or Lockhart | [Catalog](https://pipeline2.kindermorgan.com/PortalWeb/PointCatalog.aspx?code=PHP) (Agua Blanca #54226, HPL #54578), [Kinder Morgan project map](https://www.kindermorgan.com/getmedia/b9325d90-2d5e-4b96-b609-a35d22cc23cd/PHP-Expansion-Project-Fact-Sheet-July-2022_-REV4.pdf#page=2), [open season, Ex. B](https://pipeline2.kindermorgan.com/Notices/NoticeDetail.aspx?code=PHP&notc_nbr=203466) (Katy Oasis) | [FERC SOC v6.1.0, Arts. VII and XXXI](https://etariff.ferc.gov/TariffBrowser.aspx?tid=6927): $0.5136/Dth; mainline caps of 2.30% / 4.00% / 4.50% by tier. Fixed downstream fuel of 0.30% applies only to Tier 1/2 shippers using downstream points; it is not added to the modeled Tier 3 cap. | 2,650,000 Dth/day across the three tiers ([SOC](https://etariff.ferc.gov/TariffBrowser.aspx?tid=6927), Art. II). The open season offered up to 200,000 Dth/day to the Katy Market Area, not a Katy Oasis point limit. |
| GCX: Waha to Agua Dulce | [Catalog](https://pipeline2.kindermorgan.com/PortalWeb/PointCatalog.aspx?code=GCX) (Agua Blanca #53710, Tejas #53668), [Kinder Morgan project map](https://pipeline2.kindermorgan.com/Documents/TGP/2018_Customer_Meeting_-_Combined_Presentation_-_FINAL-20180823090312.pdf#page=12) | [FERC SOC v12.0.0, Arts. VII and XXX](https://etariff.ferc.gov/TariffBrowser.aspx?tid=6453): $0.4600/Dth; caps of 1.75% / 4.00% by tier. The older [RRC GUD 10825 order](https://www.rrc.texas.gov/media/portalvhdskzlfb8q9lqr9/51488/4-10825-signed-final-order.pdf) states $0.4750/Dth, not the selected FERC schedule. | 2,570,000 Dth/day across both tiers ([SOC](https://etariff.ferc.gov/TariffBrowser.aspx?tid=6453), Art. II). The [open season](https://pipeline2.kindermorgan.com/Notices/NoticeDetail.aspx?code=GCX&notc_nbr=203469) offered up to 400,000 Dth/day to the South Texas Market Area, not a Tejas point limit. |
| HPL: Lockhart to HSC Pool | [PHP catalog](https://pipeline2.kindermorgan.com/PortalWeb/PointCatalog.aspx?code=PHP) (Lockhart #54578), [Energy Transfer map](https://pipelines.energytransfer.com/ipost/main/index?asset=HPL), [HSC Pool rules](https://hpletconnect.energytransfer.com/intrastate/postedDocs/EBB%20HSC%20Pool%20training%20document%20HOW%20TO(1402111402146).pdf) | [HPL SOC v6.0.0, Ex. D](https://hpletconnect.energytransfer.com/intrastate/postedDocs/HPL_SOC_Clean_11.pdf#page=35): $0.3125/Dth, fixed 1.30% retention | 5.3 Bcf/day ([operator](https://pipelines.energytransfer.com/ipost/capacity/design-capacity-for-intrastates?asset=HPL)) |

The 2022 PHP and GCX open-season bid forms quoted fuel of 6.3% and 4.0%, respectively, for those offerings. They are not general current retention notices.

**Not public or not verified:** actual current period fuel for Agua Blanca, PHP and GCX was not verified. Actual shipper charges, tiers, entitlements, and Lockhart-to-HSC transportation and pooling confirmations are contract-specific. No public point-to-point OAC or schedules for these exact paths are seeded; use a fresh, mapped segment feed. Katy-area storage and generic Katy–HSC or Agua Dulce–HSC paths were removed because the original shortcuts did not identify a service or the required connecting agreements. The [GCX catalog](https://pipeline2.kindermorgan.com/PortalWeb/PointCatalog.aspx?code=GCX) lists a separate HPL JV delivery at Freer (#53858), not a confirmed onward HSC path.

## Optional services

Copy `.env.example` to `.env.local` and uncomment only the settings you need.

- **Notices** — v2 reuses v1’s scraper output through EBB Watch’s `/api/feed`. For a [Vercel deployment](../README.md#vercel), set `V1_NOTICE_FEED_URL` to v1's public production feed URL; without it, Vercel disables the notice feed rather than contacting the Devin preview. Off Vercel, the default remains the EBB Watch preview. Set the variable empty to disable the feed on any host. OFOs are board-level cautions, not location-specific blocks. Route results flag matching current, upcoming (with start time) and undated OFOs without treating them as capacity cuts. Explicitly expired notices are excluded. Missing, errored or older-than-12-hour board statuses are shown as incomplete coverage.
- **Capacity** — v1's notice scrapers do not provide point-level OAC or scheduled volumes. Set `OAC_FEED_URL` to a trusted, normalized JSON source providing exact segment IDs, Dth/day and observation timestamps. This app does not scrape OAC posts itself. Each segment keeps its newest observation for up to 12 hours, even if a feed refresh replays or omits it. Without a fresh observation OAC is unknown, not zero. Any reported shortfall rules out the path; otherwise a path with missing OAC remains an unverified comparison, never a confirmed fit. Scheduled volumes are shown but not subtracted from OAC a second time. Example:

  ```json
  {
    "segments": [
      {
        "edgeId": "php-katy-oasis",
        "oac": 65000,
        "scheduledVolume": 18000,
        "asOf": "2026-11-24T18:00:00Z",
        "sourceUrl": "https://example.com/operator-capacity-post"
      }
    ]
  }
  ```

  Baseline segment IDs: `agua-blanca-waha`, `php-katy-oasis`, `gcx-agua-dulce-tejas`, `php-lockhart`, `hpl-hsc`. Legacy seed IDs are intentionally not accepted. Remap observations to the new IDs only after verifying their pipeline and points match the audit above.
- **Alerts** — On refresh the engine logs newly observed OFOs and changes between successive reported OAC observations (first observation establishes a baseline). Set `ALERT_WEBHOOK_URL` to POST each alert as JSON to a trusted receiver. This enables a one-minute background refresh in a persistent Node process; `V2_BACKGROUND_REFRESH=true` also enables background dry-run logging without a webhook. Otherwise refreshes occur on demand, at most once a minute under normal operation. Delivery retries and deduplication are in memory for a single instance, so restarts can replay OFOs or lose undelivered alerts. Use a receiver that deduplicates by alert ID. Messaging platforms requiring platform-specific payloads need an adapter.
- **Graph** — In-memory by default. Set `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, and optionally `NEO4J_DATABASE` to seed and read the same corridor in Neo4j. The account needs write access to seed v2's dedicated point/segment labels; existing properties are not overwritten. The sourced graph uses a new corridor ID so existing illustrative records never enter its read. The OAC overlay remains in memory.

EXECUTIVE PITCH: PERMIAN FLOW & EBB ARBITRAGE ENGINE (MVP)

USE OF FUNDS: 6 months of dedicated cloud compute, residential proxy rotation for scraping, Neo4j AuraDB instance, and domain/infra deployment
TIMELINE TO WORKING MVP: 14 to 21 days (autonomous engineering via Devin)

THE PROBLEM
Natural gas scheduling across Permian takeaway corridors (Delaware Basin to Waha, Katy, and Houston Ship Channel) moves billions of cubic feet of gas daily. Shippers, marketers, and midstream schedulers face millions in friction and penalty risks:
- Fragmented legacy data: FERC Order 636 mandates public Electronic Bulletin Boards (EBBs), but each pipeline hosts data on archaic, unstandardized portals
- Cycle friction: Data changes across 5 NAESB nomination cycles daily (Timely, Evening, ID1, ID2, ID3). Human schedulers struggle to catch capacity cuts and tariff matrix changes in real time
- Existing software bloat: Enterprise data providers (Genscape, WoodMac) charge $50k+ per seat annually and provide lagging macroeconomic data, not actionable, flange-level scheduling optimization

THE SOLUTION
An autonomous graph-based pipeline routing and netback engine built specifically for Gulf Coast gas flows
- Automated Ingestion: Resilient scrapers extract Operationally Available Capacity, scheduled volumes, and critical Operational Flow Orders (OFOs) across key Permian takeaway pipes as soon as cycles post
- Topological Network Graph: Models every receipt, interconnect, storage facility, and delivery point in Neo4j with real-time transport tariff and fuel retention matrices
- Algorithmic Netback Solver: Instantly identifies the cheapest delivered gas paths and highlights physical constraints before nomination deadlines lock
- Direct Alerting: Delivers high-priority OFO warnings and capacity deltas directly to trading and scheduling desks via webhook / messaging bots

BUSINESS MODEL & TRACTION PATH
- Phase 1 (MVP, Days 1-21): Complete scraping, graph routing, and automated cycle alerts for the top Delaware-to-Houston corridors
- Phase 2 (Validation, Month 2): Deploy private beta to 5 boutique gas trading shops and independent scheduling consultants at $500/month per seat
- Phase 3 (Expansion): Scale to broader Gulf Coast storage facilities and expand coverage to Henry Hub and Sabine Pass LNG corridors

WHY THIS TEAM
Operator-led domain expertise directly from the gas control room desk, paired with autonomous frontier engineering models. We know the exact regulatory rules, cycle deadlines, and failure modes that enterprise software misses

MILESTONES
- Working multi-pipeline scraper covering primary Permian routes
- Live Neo4j network graph modeling real transport and fuel tariffs
- Functional webhook alerting engine delivering cycle reports
- 3 active commercial pilot commitments

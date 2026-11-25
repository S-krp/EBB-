"use client";

import { useEffect, useMemo, useState } from "react";
import { cycleClock } from "../lib/cycles.mjs";
import { dashboardTabs, tabForKey } from "../lib/dashboard-tabs.mjs";
import { corridorGraph } from "../lib/graph.mjs";
import { loadPidFilter, matchesPid, parsePids, savePidFilter } from "../lib/notice-pids.mjs";

const volumes = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});
const money = (amount) => `${amount < 0 ? "−" : ""}$${Math.abs(amount).toFixed(3)}`;
const formatTime = (value) => dateFormat.format(new Date(value));
const routeKey = (route) => route?.segments.map(({ id }) => id).join("|") ?? "";

function Corridor({ graph, route }) {
  const nodes = Object.fromEntries(graph.nodes.map((node) => [node.id, node]));
  const selected = new Map(route?.segments.map((segment) => [segment.id, segment]) ?? []);
  return <>
    <div className="diagram" tabIndex={0} role="region" aria-label="Corridor topology diagram">
      <svg viewBox="0 -26 800 304" role="img" aria-labelledby="corridor-title corridor-desc">
        <title id="corridor-title">Directed Permian corridor network</title>
        <desc id="corridor-desc">Schematic from the Delaware Basin through Waha to Katy Oasis, Agua Dulce and the Houston Ship Channel pool via Lockhart. Segment details and sources follow in the table.</desc>
        <defs>
          <marker id="arrow" markerWidth="7" markerHeight="7" viewBox="0 0 10 10" refX="9" refY="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        {graph.edges.map((edge) => {
          const a = nodes[edge.from], b = nodes[edge.to];
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const dx = Math.cos(angle) * 12, dy = Math.sin(angle) * 12;
          const active = selected.get(edge.id);
          const cls = active ? (active.constrained ? "segment constrained" : "segment selected") : "segment";
          return <line key={edge.id} x1={a.x + dx} y1={a.y + dy} x2={b.x - dx} y2={b.y - dy}
            className={cls} markerEnd="url(#arrow)" />;
        })}
        {graph.nodes.map((node) => {
          const above = node.y < 100;
          return <g key={node.id} className={`node ${node.kind}`} transform={`translate(${node.x}, ${node.y})`}>
            <circle r="8" />
            <text y={above ? -30 : 27}>{node.name}</text>
            <text y={above ? -15 : 42} className="kind">{node.kind}</text>
          </g>;
        })}
      </svg>
    </div>
    <p className="scroll-hint" aria-hidden="true">Scroll horizontally to view full network</p>
    <ul className="legend" aria-label="Map legend">
      <li><span className="swatch line-selected" />Highlighted route</li>
      <li><span className="swatch line-constrained" />Constrained</li>
      <li><span className="swatch dot-receipt" />Receipt</li>
      <li><span className="swatch dot-interconnect" />Interconnect</li>
      <li><span className="swatch dot-delivery" />Delivery</li>
    </ul>
  </>;
}

function Clock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const initTimer = setTimeout(tick, 0);
    const clockTimer = setInterval(tick, 1_000);
    return () => { clearTimeout(initTimer); clearInterval(clockTimer); };
  }, []);

  const minute = now == null ? null : Math.floor(now / 60_000);
  const upcoming = useMemo(() => (minute == null ? [] : cycleClock(new Date(minute * 60_000))), [minute]);
  const next = upcoming[0];
  const seconds = next ? Math.ceil((Date.parse(next.deadline) - now) / 1000) : 0;
  const countdown = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, "0")).join(":");
  return <section className="panel clock">
    <p className="eyebrow">01 / Nomination clock · Central</p>
    <h2>{next ? `Next: ${next.name}` : "Nomination deadlines"}</h2>
    <strong className="countdown">{next ? countdown : "—"}</strong>
    {next && <p className="muted">Deadline {formatTime(next.deadline)} · Gas day {next.gasDay}</p>}
    <ul className="clock-list">{upcoming.map((cycle) => <li key={cycle.name}>
      <strong>{cycle.name}</strong><span>{formatTime(cycle.deadline)}</span>
    </li>)}</ul>
  </section>;
}

function SegmentTable({ graph }) {
  return <div className="scroll"><table className="responsive-table">
    <caption>Public Section 311 scenario inputs · system capacity is not operationally available capacity (OAC)</caption>
    <thead><tr>
      <th>Segment and points</th>
      <th>Max interruptible tariff / Dth and fuel basis</th>
      <th>System capacity</th>
      <th className="num">OAC · Dth/day</th>
      <th className="num">Scheduled · Dth/day</th>
    </tr></thead>
    <tbody>{graph.edges.map((edge) => <tr key={edge.id}>
      <th scope="row">{edge.name}<small>{edge.points}</small>
        <small><a href={edge.pointSourceUrl}>Point source</a>
          {edge.deliverySourceUrl && <> · <a href={edge.deliverySourceUrl}>Delivery listing</a></>}
          {edge.mapUrl && <> · <a href={edge.mapUrl}>System map</a></>}</small>
      </th>
      <td data-label="Tariff / Dth and fuel"><span>${edge.tariff.toFixed(4)} · {(edge.fuel * 100).toFixed(2)}%
        <small>{edge.fuelBasis}</small><small><a href={edge.rateSourceUrl}>{edge.rateReference}</a></small>
      </span></td>
      <td data-label="System capacity"><a href={edge.designSourceUrl}>{edge.designCapacity}</a></td>
      <td className="num" data-label="OAC · Dth/day">
        <span>{edge.capacitySource === "reported" ? <>{volumes.format(edge.capacity)}
          <small><a href={edge.capacityUrl}>Reported · {formatTime(edge.capacityAsOf)}</a></small></> : "Unverified"}</span>
      </td>
      <td className="num" data-label="Scheduled · Dth/day">{edge.scheduledVolume == null ? "—" : volumes.format(edge.scheduledVolume)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function Results({ evaluation, busy, activeRouteKey, onSelectRoute }) {
  const { result, graph, asOf, feeds } = evaluation;
  const names = Object.fromEntries(graph.nodes.map(({ id, name }) => [id, name]));
  const routeName = (route) => route.path.map((id) => names[id]).join(" → ");
  const bestKey = routeKey(result.bestNetback);
  const stats = [
    ...graph.nodes.filter(({ kind }) => kind === "delivery").map(({ id, name }) => ({
      id: `delivery:${id}`, name: `Cheapest to ${name}`, route: result.cheapestByDestination[id], metric: "deliveredCost",
    })),
    { id: "netback", name: "Best origin netback overall", route: result.bestNetback, metric: "netback" },
  ];
  return <div className={busy ? "results loading" : "results"} aria-live="polite" aria-busy={busy}>
    <p className="muted">Evaluated on the {formatTime(asOf)} snapshot · OFO feed {feeds.ofo}</p>
    <div className="scores">{stats.map(({ id, name, route, metric }) => <article key={id}>
      <h3>{name}</h3>
      {route ? <>
        <strong>{money(route[metric])}<small> / Dth</small></strong><p>{routeName(route)}</p>
        {route.capacityStatus === "unverified" && <small className="warning">Capacity unverified</small>}
      </> : <p className="warning">No path outside reported constraints.</p>}
    </article>)}</div>
    <div className="scroll"><table className="responsive-table routes-table">
      <caption>Candidate routes · select a route to highlight it on the map · OFOs are board-level cautions, not a blanket capacity cut</caption>
      <thead><tr>
        <th>Route</th>
        <th className="num">Delivered / Dth</th>
        <th className="num">Netback / Dth</th>
        <th className="num">Margin / Dth</th>
        <th className="num">Origin inlet / fuel (Dth/day)</th>
        <th>Constraints</th>
      </tr></thead>
      <tbody>{result.routes.map((route) => {
        const key = routeKey(route);
        const isActive = key === activeRouteKey;
        const isCheapest = key === routeKey(result.cheapestByDestination[route.destination]);
        const ofos = [...new Map(route.segments.flatMap((segment) => segment.ofos).map((notice) => [notice.key, notice])).values()];
        return <tr key={key} className={isActive ? "active-route" : undefined}>
          <th scope="row">
            <button type="button" className="route-pick" aria-pressed={isActive} onClick={() => onSelectRoute(key)}>
              {routeName(route)}
            </button>
            <span className="badges">
              {key === bestKey && <span className="badge signal">Best netback</span>}
              {isCheapest && <span className="badge info">Cheapest to destination</span>}
              {route.capacityStatus === "constrained" && <span className="badge warn">Constrained</span>}
            </span>
          </th>
          <td className="num" data-label="Delivered / Dth">{money(route.deliveredCost)}</td>
          <td className="num" data-label="Netback / Dth">{money(route.netback)}</td>
          <td className="num" data-label="Margin / Dth">{money(route.margin)}</td>
          <td className="num" data-label="Origin inlet / fuel (Dth/day)">
            <span>{volumes.format(route.inletVolume)} inlet<small>{volumes.format(route.fuelVolume)} retained</small></span>
          </td>
          <td data-label="Constraints">
            <div className="constraints-cell">
              {route.feasible ? <span className="ok">Fits reported OAC</span> : route.segments.filter(({ constrained }) => constrained).map((segment) =>
                <span className="warning block" key={segment.id}>{segment.name}: {volumes.format(segment.required)} needed / {volumes.format(segment.capacity)} {segment.capacitySource}</span>
              )}
              {route.segments.some(({ capacity }) => capacity === null) && <span className="warning block">Missing segment OAC</span>}
              {ofos.map((notice) => <span className="warning block" key={notice.key}>
                {notice.upcoming ? "Upcoming OFO" : "OFO"} · {notice.board}: {notice.title}
                {notice.upcoming && ` · Starts ${formatTime(notice.effectiveFrom)}`}
              </span>)}
            </div>
          </td>
        </tr>;
      })}</tbody>
    </table></div>
  </div>;
}

function Alerts({ snapshot }) {
  const [pidQuery, setPidQuery] = useState("");
  useEffect(() => {
    const initial = window.setTimeout(() => setPidQuery(loadPidFilter()), 0);
    return () => window.clearTimeout(initial);
  }, []);
  const pids = parsePids(pidQuery);
  const notices = snapshot?.notices.filter((notice) => matchesPid(notice, pids)) ?? [];
  const alerts = snapshot?.alerts.filter((alert) => alert.type !== "ofo" || matchesPid(alert, pids)) ?? [];

  return <section className="panel alerts">
    <p className="eyebrow">04 / Monitor</p>
    <h2>EBB alerts</h2>
    <p className="muted">OFO feed: {snapshot?.feeds.ofo ?? "checking"} · OAC feed: {snapshot?.feeds.oac ?? "checking"}</p>
    {!!snapshot?.feeds.missedBoards.length && <p className="warning">Missing or stale notice coverage: {snapshot.feeds.missedBoards.join(", ")}.</p>}
    {snapshot && snapshot.feeds.ofo !== "connected" && <p className="muted">Notice coverage is incomplete; absence of an alert does not establish clearance.</p>}
    <label>PIDs<input type="search" placeholder="Separate PIDs with commas or spaces" value={pidQuery} onChange={(event) => {
      setPidQuery(event.target.value);
      savePidFilter(event.target.value);
    }} /></label>
    {!!notices.length && <><h3>Current, upcoming or undated OFOs</h3>
      <ul className="events">{notices.map((notice) => <li key={notice.key}>
        <strong>{notice.board} · {notice.upcoming ? "Upcoming" : "Current or timing unspecified"}</strong>
        {notice.sourceUrl ? <a href={notice.sourceUrl}>{notice.title}</a> : <span>{notice.title}</span>}
      </li>)}</ul>
    </>}
    {snapshot && !!pids.size && !notices.length && <p className="muted">No current, upcoming or undated OFOs match these PIDs.</p>}
    <h3>Recent events</h3>
    {alerts.length ? <ul className="events">{alerts.map((alert) => <li key={alert.id}>
      <strong>{alert.type === "ofo" ? "OFO" : "Capacity change"} · {formatTime(alert.observedAt)}</strong>
      {alert.sourceUrl ? <a href={alert.sourceUrl}>{alert.title}</a> : <span>{alert.title}</span>}
    </li>)}</ul> : <p className="muted">{snapshot?.alerts.length ? "No recent events match these PIDs." : "No new OFO or reported capacity change observed in this server session."}</p>}
  </section>;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState(dashboardTabs[0].id);
  const [snapshot, setSnapshot] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [feedError, setFeedError] = useState("");
  const [solveError, setSolveError] = useState("");
  const [busy, setBusy] = useState(false);
  const graph = snapshot?.graph ?? corridorGraph;
  const origins = graph.nodes.filter(({ kind }) => ["receipt", "interconnect"].includes(kind));
  const markets = graph.nodes.filter(({ kind }) => kind === "delivery");

  const activeRoute = useMemo(() => {
    if (!evaluation) return null;
    if (selectedRouteKey) {
      const picked = evaluation.result.routes.find((route) => routeKey(route) === selectedRouteKey);
      if (picked) return picked;
    }
    return evaluation.result.bestNetback;
  }, [evaluation, selectedRouteKey]);

  useEffect(() => {
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch("/api/engine", { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSnapshot(data);
        setFeedError("");
      } catch (error) {
        if (!controller.signal.aborted) setFeedError(error.message || "Could not read corridor data.");
      }
    }
    void poll();
    const pollTimer = setInterval(poll, 30_000);
    return () => { controller.abort(); clearInterval(pollTimer); };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setSolveError("");
    const values = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/engine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: values.get("origin"), supplyPrice: Number(values.get("supply")), demand: Number(values.get("volume")),
          markets: Object.fromEntries(markets.map(({ id }) => [id, Number(values.get(id))])),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const { result, ...current } = data;
      setSnapshot(current);
      setEvaluation({ ...current, result });
      setSelectedRouteKey(routeKey(result.bestNetback));
    } catch (error) {
      setSolveError(error.message || "Could not calculate routes.");
    } finally {
      setBusy(false);
    }
  }

  function navigateTabs(event) {
    const next = tabForKey(activeTab, event.key, event);
    if (!next) return;
    event.preventDefault();
    setActiveTab(next);
    document.getElementById(`dashboard-tab-${next}`)?.focus();
  }

  const routes = <>
    <div className="top-grid">
      <Clock />
      <section className="panel topology">
        <p className="eyebrow">02 / Corridor topology</p>
        <h2>Delaware to the Gulf Coast</h2>
        <p className="muted">
          {snapshot?.backend ?? "Public-source baseline"}
          {snapshot && ` · Snapshot ${formatTime(snapshot.asOf)}`}
          {activeRoute && ` · Highlight: ${routeKey(activeRoute) === routeKey(evaluation?.result.bestNetback) ? "best netback" : activeRoute.capacityStatus === "constrained" ? "constrained route" : "selected route"}`}
        </p>
        <Corridor graph={graph} route={activeRoute} />
        <SegmentTable graph={graph} />
        <details>
          <summary>What is not public or not verified</summary>
          <p>Negotiated shipper charges, tier eligibility and path entitlements are contract-specific. Actual period fuel for Agua Blanca, PHP and GCX is not verified; the HPL path to its pool requires contract confirmation.</p>
          <p>Point-to-point OAC and schedules are unverified without a current segment report. System design and open-season capacity do not fill the gap. Storage and unnamed Katy or Agua Dulce connectors are not modeled.</p>
        </details>
      </section>
    </div>
    <section className="panel solver" id="solver">
      <p className="eyebrow">03 / Routing desk</p>
      <h2>Run a netback scenario</h2>
      <p className="muted">Prices are scenario inputs, not live market quotes. Rankings can include routes with unverified capacity.</p>
      <form onSubmit={submit}>
        <label>Origin<select name="origin" defaultValue="delaware">{origins.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Supply · $/Dth<input name="supply" type="number" inputMode="decimal" step="any" defaultValue="2.25" required /></label>
        <label>Delivered · Dth/day<input name="volume" type="number" inputMode="decimal" min="0.01" step="any" defaultValue="35000" required /></label>
        {markets.map(({ id, name }) => <label key={id}>{name} · $/Dth<input name={id} type="number" inputMode="decimal" step="any" defaultValue={id === "hsc" ? "3.35" : "3.10"} required /></label>)}
        <button type="submit" disabled={busy}>{busy ? "Calculating…" : "Compare routes"}</button>
      </form>
      {solveError && <p role="alert" className="warning">{solveError}</p>}
      {evaluation && <Results evaluation={evaluation} busy={busy} activeRouteKey={routeKey(activeRoute)} onSelectRoute={setSelectedRouteKey} />}
    </section>
  </>;

  return <main>
    <a className="skip-link" href={activeTab === "routes" ? "#solver" : "#dashboard-panel-notices"}>
      {activeTab === "routes" ? "Skip to routing solver" : "Skip to OFO notices"}
    </a>
    <header className="hero">
      <p className="eyebrow">EBB Watch / Version 2 <span className="tag">Scenario MVP</span></p>
      <h1>Permian Flow &amp; EBB Arbitrage Engine</h1>
      <p>Compare Delaware and Waha routes to Katy Oasis, Agua Dulce and Houston Ship Channel.</p>
      <p className="caution">Costs use published maximum interruptible rates and tariff fuel caps or fixed retention. These are benchmarks, not a shipper quote or a nomination recommendation.</p>
    </header>
    {feedError && <p role="status" className="warning">{feedError}{snapshot ? " Showing the last successful graph snapshot." : " Showing the public-source baseline."}</p>}
    <div className="dashboard-tabs" role="tablist" aria-label="Dashboard views">
      {dashboardTabs.map(({ id, label }) => <button
        key={id}
        id={`dashboard-tab-${id}`}
        type="button"
        role="tab"
        aria-selected={activeTab === id}
        aria-controls={`dashboard-panel-${id}`}
        tabIndex={activeTab === id ? 0 : -1}
        onClick={() => setActiveTab(id)}
        onKeyDown={navigateTabs}
      >{label}</button>)}
    </div>
    {dashboardTabs.map(({ id }) => <div
      key={id}
      id={`dashboard-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`dashboard-tab-${id}`}
      tabIndex={0}
      hidden={activeTab !== id}
    >{id === "routes" ? routes : <Alerts snapshot={snapshot} />}</div>)}
  </main>;
}

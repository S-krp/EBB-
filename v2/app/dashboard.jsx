"use client";

import { useEffect, useState } from "react";
import { seedGraph } from "../lib/graph.mjs";

const volumes = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});
const money = (amount) => `${amount < 0 ? "−" : ""}$${Math.abs(amount).toFixed(3)}`;
const formatTime = (value) => dateFormat.format(new Date(value));

function Corridor({ graph, route }) {
  const nodes = Object.fromEntries(graph.nodes.map((node) => [node.id, node]));
  const selected = new Set(route?.segments.map((segment) => segment.id));
  return <div className="diagram">
    <svg viewBox="0 0 800 270" role="img" aria-labelledby="corridor-title corridor-desc">
      <title id="corridor-title">Directed Permian corridor network</title>
      <desc id="corridor-desc">Illustrative paths from Delaware Basin and Waha to Katy and Houston Ship Channel, via Katy-area storage or Agua Dulce. Segment details follow in the table.</desc>
      <defs>
        <marker id="arrow" markerWidth="7" markerHeight="7" viewBox="0 0 10 10" refX="9" refY="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>
      {graph.edges.map((edge) => {
        const a = nodes[edge.from], b = nodes[edge.to];
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const dx = Math.cos(angle) * 12, dy = Math.sin(angle) * 12;
        return <line key={edge.id} x1={a.x + dx} y1={a.y + dy} x2={b.x - dx} y2={b.y - dy}
          className={selected.has(edge.id) ? "segment selected" : "segment"} markerEnd="url(#arrow)" />;
      })}
      {graph.nodes.map((node) => <g key={node.id} className={`node ${node.kind}`} transform={`translate(${node.x}, ${node.y})`}>
        <circle r="8" />
        <text y="28">{node.name}</text>
        <text y="44" className="kind">{node.kind}</text>
      </g>)}
    </svg>
  </div>;
}

function Clock({ cycles, now }) {
  const upcoming = cycles.filter(({ deadline }) => Date.parse(deadline) > now);
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
  const names = Object.fromEntries(graph.nodes.map(({ id, name }) => [id, name]));
  return <div className="scroll"><table>
    <caption>Segment inputs · tariffs and fuel are illustrative</caption>
    <thead><tr><th>Segment</th><th>Tariff / Dth</th><th>Fuel</th><th>OAC · Dth/day</th><th>Scheduled · Dth/day</th></tr></thead>
    <tbody>{graph.edges.map((edge) => <tr key={edge.id}>
      <th scope="row">{edge.name}<small>{names[edge.from]} → {names[edge.to]}</small></th>
      <td>{money(edge.tariff)}</td><td>{(edge.fuel * 100).toFixed(1)}%</td>
      <td>{volumes.format(edge.capacity)}<small>{edge.capacitySource === "reported"
        ? <a href={edge.capacityUrl}>Reported · {formatTime(edge.capacityAsOf)}</a> : "Illustrative"}</small></td>
      <td>{edge.scheduledVolume == null ? "—" : volumes.format(edge.scheduledVolume)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function Results({ evaluation }) {
  const { result, graph, asOf, feeds } = evaluation;
  const names = Object.fromEntries(graph.nodes.map(({ id, name }) => [id, name]));
  const routeName = (route) => route.path.map((id) => names[id]).join(" → ");
  const stats = [
    { name: "Cheapest delivered", route: result.cheapest, metric: "deliveredCost" },
    { name: "Best origin netback", route: result.bestNetback, metric: "netback" },
  ];
  return <div aria-live="polite">
    <p className="muted">Evaluated on the {formatTime(asOf)} snapshot · OFO feed {feeds.ofo}</p>
    {result.cheapest ? <div className="scores">{stats.map(({ name, route, metric }) => <article key={name}>
      <h3>{name}</h3><strong>{money(route[metric])}<small> / Dth</small></strong><p>{routeName(route)}</p>
    </article>)}</div> : <p className="warning">No single route can deliver that volume under the modeled constraints.</p>}
    <div className="scroll"><table>
      <caption>Candidate routes · OFOs are board-level cautions, not a blanket capacity cut</caption>
      <thead><tr><th>Route</th><th>Delivered / Dth</th><th>Netback / Dth</th><th>Margin / Dth delivered</th><th>Constraints</th></tr></thead>
      <tbody>{result.routes.map((route) => {
        const ofos = [...new Map(route.segments.flatMap((segment) => segment.ofos).map((notice) => [notice.key, notice])).values()];
        return <tr key={route.segments.map(({ id }) => id).join("|")}>
          <th scope="row">{routeName(route)}</th>
          <td>{money(route.deliveredCost)}</td><td>{money(route.netback)}</td><td>{money(route.margin)}</td>
          <td>{route.feasible ? "Fits modeled OAC" : route.segments.filter(({ constrained }) => constrained).map((segment) =>
            <span className="warning block" key={segment.id}>{segment.name}: {volumes.format(segment.required)} needed / {volumes.format(segment.capacity)} {segment.capacitySource}</span>
          )}{ofos.map((notice) => <span className="warning block" key={notice.key}>OFO · {notice.board}: {notice.title}</span>)}</td>
        </tr>;
      })}</tbody>
    </table></div>
  </div>;
}

function Alerts({ snapshot }) {
  return <section className="panel">
    <p className="eyebrow">04 / Monitor</p>
    <h2>EBB alerts</h2>
    <p className="muted">OFO feed: {snapshot?.feeds.ofo ?? "checking"} · OAC feed: {snapshot?.feeds.oac ?? "checking"}</p>
    {!!snapshot?.feeds.missedBoards.length && <p className="warning">Missing or stale notice coverage: {snapshot.feeds.missedBoards.join(", ")}.</p>}
    {snapshot && snapshot.feeds.ofo !== "connected" && <p className="muted">Notice coverage is incomplete; absence of an alert does not establish clearance.</p>}
    {!!snapshot?.notices.length && <><h3>Current, upcoming or undated OFOs</h3>
      <ul className="events">{snapshot.notices.map((notice) => <li key={notice.key}>
        <strong>{notice.board} · {notice.upcoming ? "Upcoming" : "Current or timing unspecified"}</strong>
        {notice.sourceUrl ? <a href={notice.sourceUrl}>{notice.title}</a> : <span>{notice.title}</span>}
      </li>)}</ul>
    </>}
    <h3>Recent events</h3>
    {snapshot?.alerts.length ? <ul className="events">{snapshot.alerts.map((alert) => <li key={alert.id}>
      <strong>{alert.type === "ofo" ? "OFO" : "Capacity change"} · {formatTime(alert.observedAt)}</strong>
      {alert.sourceUrl ? <a href={alert.sourceUrl}>{alert.title}</a> : <span>{alert.title}</span>}
    </li>)}</ul> : <p className="muted">No new OFO or reported capacity change observed in this server session.</p>}
  </section>;
}

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [now, setNow] = useState(0);
  const [feedError, setFeedError] = useState("");
  const [solveError, setSolveError] = useState("");
  const [busy, setBusy] = useState(false);
  const graph = snapshot?.graph ?? seedGraph;
  const origins = graph.nodes.filter(({ kind }) => ["receipt", "interconnect"].includes(kind));
  const markets = graph.nodes.filter(({ kind }) => kind === "delivery");

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
    const clockTimer = setInterval(() => setNow(Date.now()), 1_000);
    setNow(Date.now());
    return () => { controller.abort(); clearInterval(pollTimer); clearInterval(clockTimer); };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setSolveError("");
    setEvaluation(null);
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
    } catch (error) {
      setSolveError(error.message || "Could not calculate routes.");
    } finally {
      setBusy(false);
    }
  }

  return <main>
    <header className="hero">
      <p className="eyebrow">EBB Watch / Version 2 <span className="tag">Scenario MVP</span></p>
      <h1>Permian Flow &amp; EBB Arbitrage Engine</h1>
      <p>Compare Delaware and Waha routes to Katy and Houston Ship Channel before the next nomination deadline.</p>
      <p className="caution">Topology, tariffs, fuel and any unreported capacities are illustrative. Not for physical nominations or trading decisions.</p>
    </header>
    {feedError && <p role="status" className="warning">{feedError}{snapshot ? " Showing the last successful graph snapshot." : " Showing the illustrative graph."}</p>}
    <div className="top-grid">
      <Clock cycles={snapshot?.cycles ?? []} now={now || Date.parse(snapshot?.asOf ?? 0)} />
      <section className="panel">
        <p className="eyebrow">02 / Corridor topology</p>
        <h2>Delaware to the Gulf Coast</h2>
        <p className="muted">{snapshot?.backend ?? "Illustrative preview"} {snapshot && `· Snapshot ${formatTime(snapshot.asOf)}`}{evaluation?.result.bestNetback && " · Highlight: best netback"}</p>
        <Corridor graph={graph} route={evaluation?.result.bestNetback} />
        <SegmentTable graph={graph} />
      </section>
    </div>
    <section className="panel solver">
      <p className="eyebrow">03 / Routing desk</p>
      <h2>Run a netback scenario</h2>
      <form onSubmit={submit}>
        <label>Origin<select name="origin" defaultValue="delaware">{origins.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Supply · $/Dth<input name="supply" type="number" step="any" defaultValue="2.25" required /></label>
        <label>Delivered · Dth/day<input name="volume" type="number" min="0.01" step="any" defaultValue="35000" required /></label>
        {markets.map(({ id, name }) => <label key={id}>{name} · $/Dth<input name={id} type="number" step="any" defaultValue={id === "hsc" ? "3.35" : "3.10"} required /></label>)}
        <button disabled={busy}>{busy ? "Calculating…" : "Compare routes"}</button>
      </form>
      {solveError && <p role="alert" className="warning">{solveError}</p>}
      {evaluation && <Results evaluation={evaluation} />}
    </section>
    <Alerts snapshot={snapshot} />
  </main>;
}

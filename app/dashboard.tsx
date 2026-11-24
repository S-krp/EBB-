"use client";

import { Activity, AlertTriangle, ArrowDown, ArrowUpRight, CalendarDays, Clock3, ExternalLink, LayoutGrid, List, Radio, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { boardIds, boards, categories, type BoardId, type Category, type Notice, type Snapshot } from "../lib/model";

const timezone = "America/Chicago";
const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" });
const filterDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });

const chips: Record<Category, string> = {
  OFO: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  "Force Majeure": "border-orange-400/35 bg-orange-400/10 text-orange-200",
  Maintenance: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  Critical: "border-rose-400/35 bg-rose-400/10 text-rose-200",
  "Non-Critical": "border-slate-500/40 bg-slate-400/10 text-slate-300",
};

function stamp(value: string | null | undefined, showDate = true) {
  if (!value) return "—";
  const date = new Date(value);
  return showDate ? `${dayFormat.format(date)} · ${timeFormat.format(date)}` : timeFormat.format(date);
}

function windowLabel(notice: Notice) {
  const start = notice.effectiveFrom && dayFormat.format(new Date(notice.effectiveFrom));
  const end = notice.effectiveThrough && dayFormat.format(new Date(notice.effectiveThrough));
  if (start && end && start !== end) return `${start} – ${end}`;
  if (start) return start;
  return end ? `Through ${end}` : "—";
}

function Badge({ notice }: { notice: Notice }) {
  return <div className="flex flex-wrap items-center gap-1.5">
    <span className={`rounded border px-2 py-1 text-[11px] leading-none font-bold whitespace-nowrap ${chips[notice.category]}`}>{notice.category}</span>
    {notice.emergency && <span className={`rounded border px-2 py-1 text-[11px] leading-none font-bold ${chips.Critical}`}>Emergency</span>}
    {!!notice.tolerances.length && <span className="font-mono text-xs font-bold text-amber-200" title="OFO tolerances">{notice.tolerances.join(", ")}</span>}
  </div>;
}

function Source({ url, title }: { url: string; title: string }) {
  return <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open source for ${title}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-soft hover:text-signal">Source <ArrowUpRight size={13} /></a>;
}

function Drawer({ notice, close }: { notice: Notice; close: () => void }) {
  const element = useRef<HTMLDialogElement>(null);
  useEffect(() => { element.current?.showModal(); }, []);
  return <dialog ref={element} onClose={close} onClick={(event) => { if (event.target === event.currentTarget) close(); }} aria-labelledby="notice-title"
    className="m-0 ml-auto h-dvh max-h-none w-full max-w-[640px] border-l border-line bg-panel text-slate-100 backdrop:bg-black/65">
    <div className="min-h-full px-6 py-7 sm:px-9">
      <div className="mb-6 flex items-center justify-between">
        <div className="font-mono text-xs tracking-widest text-signal">NOTICE / #{notice.id}</div>
        <button type="button" autoFocus onClick={close} aria-label="Close notice" className="rounded-md border border-line p-2 text-soft hover:text-white"><X size={17} /></button>
      </div>
      <Badge notice={notice} />
      <h2 id="notice-title" className="mt-4 text-2xl leading-tight font-bold">{notice.title}</h2>
      <p className="mt-2 text-sm text-soft">{notice.pipeline}{notice.sourceType ? ` · ${notice.sourceType}` : ""}</p>
      <dl className="my-6 grid gap-3 rounded-lg border border-line bg-inset p-4 text-sm sm:grid-cols-2">
        {[["Posted", notice.postedAt], ["Effective start", notice.effectiveFrom], ["Effective end", notice.effectiveThrough]].map(([label, value]) => <div key={label}>
          <dt className="text-xs text-soft">{label} (CT)</dt><dd className="mt-1">{stamp(value)}</dd>
        </div>)}
      </dl>
      <h3 className="mb-3 text-sm font-bold">Notice text</h3>
      <p className="text-sm leading-7 whitespace-pre-wrap [overflow-wrap:anywhere] text-slate-200">{notice.body || "The board did not publish inline notice text. Open the original posting for details or attachments."}</p>
      <a href={notice.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-bold text-signal hover:bg-inset">Open original posting <ExternalLink size={14} /></a>
    </div>
  </dialog>;
}

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const heading = "font-mono text-[10px] font-bold tracking-[0.16em] uppercase text-faint";
const field = "rounded-md border border-line bg-inset px-2.5 py-2 text-xs text-soft";
const noticeKey = (notice: Notice) => JSON.stringify([notice.board, notice.pipeline, notice.id]);
const pageSize = 25;

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [feedError, setFeedError] = useState("");
  const [manualMessage, setManualMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [pipelines, setPipelines] = useState<BoardId[]>([]);
  const [types, setTypes] = useState<Category[]>([]);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [range, setRange] = useState({ start: "", end: "" });
  const [view, setView] = useState<"table" | "cards">("table");
  const [selected, setSelected] = useState<Notice | null>(null);
  const [page, setPage] = useState(1);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/feed", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load the notice feed.");
      setSnapshot(await response.json() as Snapshot);
      setFeedError("");
    } catch {
      setFeedError("Could not load the notice feed. Retrying automatically.");
    }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [refresh]);

  async function runSweep() {
    setBusy(true);
    setManualMessage("");
    try {
      const response = await fetch("/api/sweep", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const failed = result.status.filter((board: { error: string | null }) => board.error).length;
      setManualMessage(failed ? `Sweep completed with ${failed} board error${failed === 1 ? "" : "s"}.` : "Sweep completed.");
    } catch (error) {
      setManualMessage(error instanceof Error ? error.message : "Could not complete the sweep.");
    } finally {
      await refresh();
      setBusy(false);
    }
  }

  const notices = useMemo(() => snapshot?.notices ?? [], [snapshot]);
  const filtered = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return notices.filter((notice) => {
      if (pipelines.length && !pipelines.includes(notice.board)) return false;
      if (types.length && !types.includes(notice.category)) return false;
      if (criticalOnly && !notice.critical) return false;
      if (range.start || range.end) {
        if (!notice.postedAt) return false;
        const date = filterDate.format(new Date(notice.postedAt));
        if ((range.start && date < range.start) || (range.end && date > range.end)) return false;
      }
      const text = `${notice.title}\n${notice.body}\n${notice.id}\n${notice.pipeline}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [criticalOnly, notices, pipelines, query, range, types]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasFilters = !!(query || pipelines.length || types.length || criticalOnly || range.start || range.end);
  const statusByBoard = new Map(snapshot?.status.map((item) => [item.board, item]));
  const successCount = snapshot?.status.filter((item) => item.lastSuccess && !item.error).length ?? 0;
  const metrics = [
    { label: "Notices collected", count: notices.length, caption: "Across connected public boards", icon: List, color: "text-signal" },
    { label: "Critical notices", count: notices.filter((notice) => notice.critical).length, caption: "Includes OFOs and force majeure", icon: AlertTriangle, color: "text-rose-300" },
    { label: "Operational flow orders", count: notices.filter((notice) => notice.category === "OFO").length, caption: "Including published tolerances", icon: Activity, color: "text-amber-300" },
    { label: "Healthy boards", count: `${successCount} / ${boardIds.length}`, caption: "Based on the latest sweep", icon: Radio, color: "text-signal" },
  ];

  return <>
    <header className="border-b border-line bg-inset">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-signal/25 bg-signal/10 p-2 text-signal"><Activity size={23} strokeWidth={2.2} /></div>
          <div><div className="text-lg leading-tight font-bold">EBB Watch</div><div className="mt-0.5 font-mono text-[9px] tracking-[0.14em] uppercase text-faint">Natural gas intelligence</div></div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-soft"><span className="size-2 rounded-full bg-signal shadow-[0_0_8px_#69e7cb80]" /> <span>Public EBBs</span></div>
      </div>
    </header>
    <main className="mx-auto max-w-[1600px] space-y-6 px-4 pt-7 pb-10 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className={heading + " mb-2 text-signal"}>Operations / Notice Monitor</div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Pipeline Notice Dashboard</h1><p className="mt-2 text-sm text-soft">Critical notices, flow orders, and maintenance from public pipeline boards.</p></div>
        <button type="button" onClick={runSweep} disabled={busy} className="flex min-w-32 items-center justify-center gap-2 rounded-md bg-signal px-4 py-2.5 text-sm font-bold text-canvas hover:bg-teal-200 disabled:opacity-65">
          <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> {busy ? "Sweeping…" : "Run sweep"}
        </button>
      </div>
      {(feedError || manualMessage || busy) && <p role="status" className="rounded-md border border-line bg-panel px-4 py-2 text-sm text-soft">{feedError || manualMessage || "Sweeping public boards. This can take a few minutes."}</p>}

      <section aria-label="Notice and board statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(({ label, count, caption, icon: Icon, color }) => <div key={label} className="rounded-lg border border-line bg-panel p-4">
          <div className="flex items-center justify-between gap-2"><span className={heading}>{label}</span><Icon size={16} className={color} /></div>
          <div className={`mt-2 font-mono text-2xl font-bold ${color}`}>{snapshot ? count : "—"}</div>
          <div className="mt-1 text-xs text-soft">{caption}</div>
        </div>)}
      </section>

      <section aria-labelledby="board-status" className="rounded-lg border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 id="board-status" className="flex items-center gap-2 text-sm font-bold"><Radio size={16} className="text-signal" /> Board status</h2>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-soft"><Clock3 size={14} /> Next sweep: {stamp(snapshot?.nextSweep)}{snapshot && " CT"}</span>
        </div>
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-b-lg bg-line sm:grid-cols-4 xl:grid-cols-7">
          {boardIds.map((id) => {
            const status = statusByBoard.get(id);
            return <li key={id} className="bg-panel px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold"><span aria-label={status?.error ? "Error" : status?.lastSuccess ? "Healthy" : "Not swept"} className={`size-1.5 shrink-0 rounded-full ${status?.error ? "bg-rose-400" : status?.lastSuccess ? "bg-signal" : "bg-slate-500"}`} />{boards[id].label}</div>
              <p className="mt-1 text-[11px] text-soft" title={status?.lastSuccess ? `Last successful sweep: ${stamp(status.lastSuccess)} CT` : undefined}>{status?.lastSuccess ? `${stamp(status.lastSuccess)} CT` : "No successful sweep yet"}</p>
              {status?.error && <details className="mt-1 text-[11px] text-rose-300"><summary className="cursor-pointer">Latest sweep error</summary><p className="mt-1 break-words">{status.error}</p></details>}
            </li>;
          })}
        </ul>
      </section>

      <section aria-labelledby="notice-feed" className="overflow-hidden rounded-lg border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4">
          <div className="flex items-center gap-2.5"><h2 id="notice-feed" className="text-base font-bold">Live Notice Feed</h2><span className="rounded-full bg-signal/10 px-2 py-0.5 font-mono text-xs text-signal">{filtered.length}</span></div>
          <div aria-label="Feed layout" className="flex rounded-md border border-line bg-inset p-0.5">
            {(["table", "cards"] as const).map((option) => {
              const Icon = option === "table" ? List : LayoutGrid;
              return <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)} className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs capitalize ${view === option ? "bg-line font-bold text-white" : "text-soft hover:text-white"}`}><Icon size={14} /> {option}</button>;
            })}
          </div>
        </div>
        <div className="space-y-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-40 flex-1"><span className="sr-only">Search notices</span><Search size={15} className="absolute top-2.5 left-3 text-faint" /><input type="search" placeholder="Search headlines, notice text, or IDs…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className={field + " w-full pl-9"} /></label>
            <span className="flex items-center gap-2" aria-label="Posted date range"><CalendarDays size={15} className="text-faint" />
              <input type="date" aria-label="Posted from" value={range.start} onChange={(event) => { setRange({ ...range, start: event.target.value }); setPage(1); }} className={field} />
              <span className="text-xs text-faint">to</span>
              <input type="date" aria-label="Posted through" value={range.end} onChange={(event) => { setRange({ ...range, end: event.target.value }); setPage(1); }} className={field} />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2"><span className={heading + " w-16"}>Pipeline</span>{boardIds.map((id) => <button key={id} type="button" aria-pressed={pipelines.includes(id)} onClick={() => { setPipelines(toggle(pipelines, id)); setPage(1); }} className={`rounded-md border px-2.5 py-1 text-xs ${pipelines.includes(id) ? "border-signal/50 bg-signal/10 font-bold text-signal" : "border-line text-soft hover:text-white"}`}>{boards[id].label}</button>)}</div>
          <div className="flex flex-wrap items-center gap-2"><span className={heading + " w-16"}>Type</span>
            <button type="button" aria-pressed={criticalOnly} onClick={() => { setCriticalOnly(!criticalOnly); setPage(1); }} className={`rounded-md border px-2.5 py-1 text-xs ${criticalOnly ? "border-rose-400/40 bg-rose-400/10 text-rose-200" : "border-line text-soft hover:text-white"}`}>Critical only</button>
            {categories.map((category) => <button key={category} type="button" aria-pressed={types.includes(category)} onClick={() => { setTypes(toggle(types, category)); setPage(1); }} className={`rounded-md border px-2.5 py-1 text-xs ${types.includes(category) ? chips[category] : "border-line text-soft hover:text-white"}`}>{category}</button>)}
            {hasFilters && <button type="button" onClick={() => { setQuery(""); setPipelines([]); setTypes([]); setCriticalOnly(false); setRange({ start: "", end: "" }); setPage(1); }} className="ml-auto text-xs text-signal hover:underline">Clear filters</button>}
          </div>
        </div>
        {!visible.length ? <div className="px-4 py-14 text-center text-sm text-soft">{snapshot ? hasFilters ? "No notices match these filters." : "No notices collected yet. Run a sweep to populate the feed." : feedError || "Loading the notice feed…"}</div>
        : view === "table" ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
          <thead className={"border-b border-line bg-inset " + heading}><tr>
            <th scope="col" className="px-4 py-3">Pipeline / ID</th><th scope="col" className="px-4 py-3">Notice</th><th scope="col" className="px-4 py-3">Type</th><th scope="col" className="px-4 py-3">Effective dates</th><th scope="col" className="px-4 py-3"><span className="flex items-center gap-1">Posted (CT) <ArrowDown size={11} /></span></th><th scope="col" className="px-4 py-3">Original</th>
          </tr></thead>
          <tbody className="divide-y divide-line">{visible.map((notice) => <tr key={noticeKey(notice)} className="hover:bg-inset">
            <td className="max-w-44 px-4 py-3"><div className="text-xs font-bold">{notice.pipeline}</div><div className="mt-1 font-mono text-[11px] text-faint">#{notice.id}</div></td>
            <td className="max-w-[32rem] px-4 py-3"><button type="button" className="text-left text-sm font-semibold text-slate-100 hover:text-signal" onClick={() => setSelected(notice)}>{notice.title}</button></td>
            <td className="px-4 py-3"><Badge notice={notice} /></td>
            <td className="px-4 py-3 text-xs leading-5 text-soft">{windowLabel(notice)}</td>
            <td className="px-4 py-3 text-xs leading-5 whitespace-nowrap text-soft">{stamp(notice.postedAt)}</td>
            <td className="px-4 py-3"><Source url={notice.sourceUrl} title={notice.title} /></td>
          </tr>)}</tbody>
        </table></div>
        : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((notice) => <article key={noticeKey(notice)} className="flex flex-col gap-2 rounded-lg border border-line bg-inset p-4">
          <div className="flex justify-between gap-2 text-xs text-soft"><span>{notice.pipeline}</span><span className="font-mono">#{notice.id}</span></div>
          <button type="button" className="text-left text-sm font-bold hover:text-signal" onClick={() => setSelected(notice)}>{notice.title}</button>
          <Badge notice={notice} />
          <div className="mt-auto flex flex-wrap justify-between gap-1 border-t border-line pt-2 text-xs text-soft"><span>Effective: {windowLabel(notice)}</span><span>Posted: {stamp(notice.postedAt)} CT</span><Source url={notice.sourceUrl} title={notice.title} /></div>
        </article>)}</div>}
        {!!filtered.length && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs text-soft">
          <span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} notices</span>
          <div className="flex gap-2">
            <button type="button" className="rounded border border-line px-2 py-1 hover:text-white disabled:opacity-40" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <button type="button" className="rounded border border-line px-2 py-1 hover:text-white disabled:opacity-40" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>
        </div>}
      </section>
      <footer className="flex flex-wrap justify-between gap-2 text-xs text-faint"><span>EBB Watch · Public informational postings</span><span>All displayed times are Central Time · Verify critical details at the source.</span></footer>
    </main>
    {selected && <Drawer notice={selected} close={() => setSelected(null)} />}
  </>;
}

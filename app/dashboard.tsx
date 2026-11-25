"use client";

import { Activity, AlertTriangle, ArrowDown, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, LayoutGrid, List, Radio, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createFeedRefresh } from "../lib/feed-refresh";
import { boardIds, boards, categories, type Category, type Notice, type NoticeBlock, type Snapshot } from "../lib/model";
import { emptyNoticeFilters, filterNotices, hasInvertedRange, indexNotices, readNoticeFilters, writeNoticeFilters, type NoticeFilters } from "../lib/notice-filters";
import { countNonLiftedOfos, isLifted } from "../lib/notice-status";

const timezone = "America/Chicago";
const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" });

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
    <span className={`rounded border px-2 py-1 text-xs leading-tight font-bold ${chips[notice.category]}`}>{notice.category}</span>
    {notice.emergency && <span className={`rounded border px-2 py-1 text-xs leading-tight font-bold ${chips.Critical}`}>Emergency</span>}
    {notice.critical && !notice.emergency && (notice.category === "Maintenance" || notice.category === "Non-Critical") && <span className={`rounded border px-2 py-1 text-xs leading-tight font-bold ${chips.Critical}`} title="Posted as critical by the pipeline">Critical</span>}
    {isLifted(notice) && <span className="rounded border border-emerald-400/35 bg-emerald-400/10 px-2 py-1 text-xs leading-tight font-bold text-emerald-200">Lifted</span>}
    {!!notice.tolerances.length && <span className="font-mono text-xs font-bold wrap-anywhere text-amber-200" title="OFO tolerances">Tol {notice.tolerances.join(", ")}</span>}
  </div>;
}

function Source({ url, title }: { url: string; title: string }) {
  return <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open source for ${title}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-soft hover:text-signal">Source <ArrowUpRight size={13} /></a>;
}

function NoticeBody({ notice }: { notice: Notice }) {
  if (!notice.bodyBlocks?.length) return <p className="whitespace-pre-wrap wrap-anywhere">{notice.body || "The board did not publish inline notice text. Open the original posting for details or attachments."}</p>;
  return <NoticeBlocks blocks={notice.bodyBlocks} title={notice.title} />;
}

function NoticeBlocks({ blocks, title }: { blocks: NoticeBlock[]; title: string }) {
  return <div className="space-y-5">{blocks.map((block, index) => block.type === "text"
    ? <p key={index} className="whitespace-pre-wrap wrap-anywhere">{block.text}</p>
    : <div key={index} role="region" aria-label={`Notice table ${index + 1}`} tabIndex={0} className="overflow-x-auto rounded-lg border border-line focus-visible:outline-2 focus-visible:outline-signal">
      <table className="w-full border-collapse text-left text-sm leading-6" aria-label={`${title} — table ${index + 1}`}>
        {block.caption && <caption className="bg-inset px-4 py-3 text-left font-bold">{block.caption}</caption>}
        <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-line last:border-b-0 even:bg-inset">{row.map((cell, cellIndex) => {
          const Cell = cell.header ? "th" : "td";
          return <Cell key={cellIndex} colSpan={cell.colSpan} rowSpan={cell.rowSpan} className={`min-w-24 border-r border-line px-4 py-3 align-top whitespace-pre-line last:border-r-0 ${cell.header ? "bg-inset font-bold text-slate-100" : "text-slate-200"}`}>{cell.blocks ? <NoticeBlocks blocks={cell.blocks} title={title} /> : cell.text}</Cell>;
        })}</tr>)}</tbody>
      </table>
    </div>)}</div>;
}

function Drawer({ notice, position, total, step, close }: { notice: Notice; position: number; total: number; step: (delta: number) => void; close: () => void }) {
  const element = useRef<HTMLDialogElement>(null);
  useEffect(() => { element.current?.showModal(); }, []);
  useEffect(() => {
    element.current?.scrollTo({ top: 0 });
    element.current?.querySelectorAll('[role="region"]').forEach((region) => region.scrollTo({ left: 0 }));
  }, [notice]);
  const pager = "grid size-11 shrink-0 place-items-center rounded-md border border-line text-soft hover:text-white disabled:opacity-40";
  return <dialog ref={element} onClose={close} onClick={(event) => { if (event.target === event.currentTarget) close(); }} aria-labelledby="notice-title"
    onKeyDown={(event) => {
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !(event.target as HTMLElement).closest('[role="region"]')) { event.preventDefault(); step(event.key === "ArrowLeft" ? -1 : 1); }
    }}
    className="m-0 ml-auto h-dvh max-h-none w-full max-w-[1200px] overflow-x-hidden border-l border-line bg-panel text-slate-100 backdrop:bg-black/65">
    <div className="min-h-full px-5 py-5 sm:px-9 sm:py-7">
      <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6 sm:gap-4">
        <div className="font-mono text-xs tracking-widest wrap-anywhere text-signal">NOTICE / #{notice.id}</div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {position >= 0 && <span className="mr-1 font-mono text-xs text-faint">{position + 1} / {total}</span>}
          <button type="button" onClick={() => step(-1)} disabled={position <= 0} aria-label="Previous notice" title="Previous notice (←)" className={pager}><ChevronLeft size={17} /></button>
          <button type="button" onClick={() => step(1)} disabled={position < 0 || position >= total - 1} aria-label="Next notice" title="Next notice (→)" className={pager}><ChevronRight size={17} /></button>
          <button type="button" autoFocus onClick={close} aria-label="Close notice" className={pager}><X size={17} /></button>
        </div>
      </div>
      <Badge notice={notice} />
      <h2 id="notice-title" className="mt-4 text-2xl leading-tight font-bold wrap-anywhere">{notice.title}</h2>
      <p className="mt-2 text-sm wrap-anywhere text-soft">{notice.pipeline}{notice.sourceType ? ` · ${notice.sourceType}` : ""}</p>
      <dl className="my-6 grid gap-3 rounded-lg border border-line bg-inset p-4 text-sm sm:grid-cols-2">
        {[["Posted", notice.postedAt], ["Effective start", notice.effectiveFrom], ["Effective end", notice.effectiveThrough]].map(([label, value]) => <div key={label}>
          <dt className="text-xs text-soft">{label} (CT)</dt><dd className="mt-1">{value ? stamp(value) : label === "Effective end" && notice.effectiveFrom ? "Until further notice" : "—"}</dd>
        </div>)}
      </dl>
      <h3 className="mb-3 text-sm font-bold">Notice text</h3>
      <div className="text-base leading-relaxed text-slate-200"><NoticeBody notice={notice} /></div>
      <a href={notice.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-bold text-signal hover:bg-inset">Open original posting <ExternalLink size={14} /></a>
    </div>
  </dialog>;
}

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const filtersChanged = "noticefilterschange";
const getFilterSearch = () => window.location.search;
const getServerFilterSearch = () => "";

function subscribeToFilterSearch(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(filtersChanged, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(filtersChanged, listener);
  };
}

const heading = "font-mono text-xs font-bold tracking-wide uppercase text-faint";
const field = "rounded-md border border-line bg-inset px-2.5 py-2 text-xs text-soft";
const noticeKey = (notice: Notice) => JSON.stringify([notice.board, notice.pipeline, notice.id]);
const pageSize = 25;
const narrowView = "(width < 48rem)";

function subscribeToNarrowView(callback: () => void) {
  const media = window.matchMedia(narrowView);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function isNarrowView() {
  return window.matchMedia(narrowView).matches;
}

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [feedError, setFeedError] = useState("");
  const [manualMessage, setManualMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const filterSearch = useSyncExternalStore(subscribeToFilterSearch, getFilterSearch, getServerFilterSearch);
  const filters = useMemo(() => readNoticeFilters(new URLSearchParams(filterSearch)), [filterSearch]);
  const { query, pidQuery, pipelines, types, criticalOnly, range } = filters;
  const invalidRange = hasInvertedRange(range);
  const isNarrow = useSyncExternalStore(subscribeToNarrowView, isNarrowView, () => false);
  const [chosenView, setView] = useState<"table" | "cards" | null>(null);
  const view = chosenView ?? (isNarrow ? "cards" : "table");
  const [selected, setSelected] = useState<Notice | null>(null);
  const [page, setPage] = useState(1);

  function updateFilters(changes: Partial<NoticeFilters>) {
    const url = new URL(window.location.href);
    writeNoticeFilters(url.searchParams, { ...filters, ...changes });
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event(filtersChanged));
    setPage(1);
  }

  const refresh = useMemo(() => createFeedRefresh(setSnapshot, setFeedError), []);
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
  const noticeIndex = useMemo(() => indexNotices(notices), [notices]);
  const filtered = useMemo(() => filterNotices(noticeIndex, filters), [noticeIndex, filters]);
  const selectedIndex = selected ? filtered.findIndex((notice) => noticeKey(notice) === noticeKey(selected)) : -1;
  const stepSelected = (delta: number) => {
    const next = filtered[selectedIndex + delta];
    if (selectedIndex < 0 || !next) return;
    setSelected(next);
    setPage(Math.floor((selectedIndex + delta) / pageSize) + 1);
  };
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasFilters = !!(query || pidQuery || pipelines.length || types.length || criticalOnly || range.start || range.end);
  const statusByBoard = new Map(snapshot?.status.map((item) => [item.board, item]));
  const successCount = snapshot?.status.filter((item) => item.lastSuccess && !item.error).length ?? 0;
  const metrics = [
    { label: "Notices collected", count: notices.length, caption: "Across connected public boards", icon: List, color: "text-signal" },
    { label: "Critical notices", count: notices.filter((notice) => notice.critical).length, caption: "Includes OFOs and force majeure", icon: AlertTriangle, color: "text-rose-300" },
    { label: "Operational flow orders", count: countNonLiftedOfos(notices), caption: "Including published tolerances", icon: Activity, color: "text-amber-300" },
    { label: "Healthy boards", count: `${successCount} / ${boardIds.length}`, caption: "Based on the latest sweep", icon: Radio, color: "text-signal" },
  ];

  return <>
    <header className="border-b border-line bg-inset">
      <div className="mx-auto flex max-w-[2240px] items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-signal/25 bg-signal/10 p-2 text-signal"><Activity size={23} strokeWidth={2.2} /></div>
          <div><div className="text-lg leading-tight font-bold">EBB Watch</div><div className="mt-0.5 hidden font-mono text-xs tracking-wide uppercase text-faint sm:block">Natural gas intelligence</div></div>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs tracking-wide text-soft uppercase"><span className="size-2 shrink-0 rounded-full bg-signal shadow-[0_0_8px_#69e7cb80]" /> <span>Public EBBs</span></div>
      </div>
    </header>
    <main className="mx-auto max-w-[2240px] space-y-4 px-4 pt-4 pb-10 md:space-y-6 md:px-8 md:pt-7">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-3">
        <div className="w-full sm:w-auto"><div className={heading + " mb-1.5 text-signal"}>Operations / Notice Monitor</div><h1 className="text-2xl font-bold tracking-tight sm:text-4xl">Pipeline Notice Dashboard</h1><p className="mt-2 text-sm text-soft">Critical notices, flow orders, and maintenance from public pipeline boards.</p></div>
        <button type="button" onClick={runSweep} disabled={busy} className="flex min-w-32 items-center justify-center gap-2 rounded-md bg-signal px-4 py-2.5 text-sm font-bold text-canvas hover:bg-teal-200 disabled:opacity-65">
          <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> {busy ? "Sweeping…" : "Run sweep"}
        </button>
        <a href="#notice-feed" className="self-center rounded text-sm font-bold text-signal hover:underline md:hidden">Jump to notices <ArrowDown className="inline" size={14} /></a>
      </div>
      {(feedError || manualMessage || busy) && <p role="status" className="rounded-md border border-line bg-panel px-4 py-2 text-sm text-soft">{manualMessage || feedError || "Sweeping public boards. This can take a few minutes."}</p>}

      <section aria-label="Notice and board statistics" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {metrics.map(({ label, count, caption, icon: Icon, color }) => <div key={label} className="rounded-lg border border-line bg-panel p-2.5 sm:p-4">
          <div className="flex items-center justify-between gap-2"><span className={heading}>{label}</span><Icon size={16} className={`shrink-0 ${color}`} /></div>
          <div className={`mt-1 font-mono text-xl font-bold sm:mt-2 sm:text-2xl ${color}`}>{snapshot ? count : "—"}</div>
          <div className="mt-0.5 text-xs text-soft sm:mt-1">{caption}</div>
        </div>)}
      </section>

      <section aria-labelledby="board-status" className="rounded-lg border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 id="board-status" className="flex items-center gap-2 text-sm font-bold"><Radio size={16} className="text-signal" /> Board status</h2>
          <span className="flex items-center gap-1.5 font-mono text-xs text-soft"><Clock3 size={14} /> Next sweep: {stamp(snapshot?.nextSweep)}{snapshot && " CT"}</span>
        </div>
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-b-lg bg-line sm:grid-cols-4 xl:grid-cols-7">
          {boardIds.map((id) => {
            const status = statusByBoard.get(id);
            return <li key={id} className="min-w-0 bg-panel px-3 py-2 sm:px-4 sm:py-3">
              <div className="flex items-center gap-2 text-xs font-bold"><span aria-label={status?.error ? "Error" : status?.lastSuccess ? "Healthy" : "Not swept"} className={`size-1.5 shrink-0 rounded-full ${status?.error ? "bg-rose-400" : status?.lastSuccess ? "bg-signal" : "bg-slate-500"}`} />{boards[id].label}</div>
              <p className="mt-1 text-xs text-soft" title={status?.lastSuccess ? `Last successful sweep: ${stamp(status.lastSuccess)} CT` : undefined}>{status?.lastSuccess ? `${stamp(status.lastSuccess)} CT` : "No successful sweep yet"}</p>
              {status?.error && <details className="mt-1 text-xs text-rose-300"><summary className="cursor-pointer">Latest sweep error</summary><p className="mt-1 wrap-anywhere">{status.error}</p></details>}
            </li>;
          })}
        </ul>
      </section>

      <section aria-labelledby="notice-feed" className="overflow-hidden rounded-lg border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-3 sm:gap-3 sm:px-4 sm:py-4">
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
            <label className="relative min-w-40 flex-1"><span className="sr-only">Search notices</span><Search size={15} className="absolute top-2.5 left-3 text-faint" /><input type="search" placeholder="Search headlines, notice text, or IDs…" value={query} onChange={(event) => updateFilters({ query: event.target.value })} className={field + " w-full pl-9"} /></label>
            <label className="flex min-w-48 flex-1 items-center gap-2"><span className={heading}>PIDs</span><input type="search" placeholder="Separate PIDs with commas or spaces" value={pidQuery} onChange={(event) => updateFilters({ pidQuery: event.target.value })} className={field + " min-w-0 flex-1"} /></label>
            <span role="group" aria-label="Posted (CT)" className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 text-xs text-soft"><CalendarDays size={15} className="shrink-0 text-faint" aria-hidden="true" />Posted (CT)</span>
              <span className="flex min-w-0 items-center gap-2">
                <input type="date" aria-label="Posted from (CT)" aria-invalid={invalidRange} aria-describedby={invalidRange ? "posted-range-error" : undefined} value={range.start} onChange={(event) => updateFilters({ range: { ...range, start: event.target.value } })} className={field + " min-w-0"} />
                <span className="text-xs text-faint">to</span>
                <input type="date" aria-label="Posted through (CT)" aria-invalid={invalidRange} aria-describedby={invalidRange ? "posted-range-error" : undefined} value={range.end} onChange={(event) => updateFilters({ range: { ...range, end: event.target.value } })} className={field + " min-w-0"} />
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2"><span className={heading + " w-16"}>Pipeline</span>{boardIds.map((id) => <button key={id} type="button" aria-pressed={pipelines.includes(id)} onClick={() => updateFilters({ pipelines: toggle(pipelines, id) })} className={`rounded-md border px-2.5 py-1 text-xs ${pipelines.includes(id) ? "border-signal/50 bg-signal/10 font-bold text-signal" : "border-line text-soft hover:text-white"}`}>{boards[id].label}</button>)}</div>
          <div className="flex flex-wrap items-center gap-2"><span className={heading + " w-16"}>Type</span>
            <button type="button" aria-pressed={criticalOnly} onClick={() => updateFilters({ criticalOnly: !criticalOnly })} className={`rounded-md border px-2.5 py-1 text-xs ${criticalOnly ? "border-rose-400/40 bg-rose-400/10 text-rose-200" : "border-line text-soft hover:text-white"}`}>Critical only</button>
            {categories.map((category) => <button key={category} type="button" aria-pressed={types.includes(category)} onClick={() => updateFilters({ types: toggle(types, category) })} className={`rounded-md border px-2.5 py-1 text-xs ${types.includes(category) ? chips[category] : "border-line text-soft hover:text-white"}`}>{category}</button>)}
            {hasFilters && <button type="button" onClick={() => updateFilters(emptyNoticeFilters)} className="ml-auto text-xs text-signal hover:underline">Clear filters</button>}
          </div>
        </div>
        {invalidRange ? <p id="posted-range-error" role="alert" className="px-4 py-14 text-center text-sm text-amber-200">The Posted from date must be on or before the Posted through date.</p>
        : !visible.length ? <div className="px-4 py-14 text-center text-sm text-soft">{snapshot ? hasFilters ? "No notices match these filters." : "No notices collected yet. Run a sweep to populate the feed." : feedError || "Loading the notice feed…"}</div>
        : view === "table" ? <table className="w-full table-fixed text-left text-sm">
          <thead className={"border-b border-line bg-inset " + heading}><tr>
            <th scope="col" className="hidden w-[15%] px-4 py-3 lg:table-cell">Pipeline / ID</th>
            <th scope="col" className="px-3 py-3 lg:px-4">Notice</th>
            <th scope="col" className="w-[33%] px-3 py-3 lg:w-[15%] lg:px-4">Type</th>
            <th scope="col" className="hidden w-[14%] px-4 py-3 lg:table-cell">Effective dates</th>
            <th scope="col" className="hidden w-[15%] px-4 py-3 lg:table-cell"><span className="flex items-center gap-1">Posted (CT) <ArrowDown size={11} /></span></th>
            <th scope="col" className="hidden w-[7rem] px-4 py-3 lg:table-cell">Original</th>
          </tr></thead>
          <tbody className="divide-y divide-line">{visible.map((notice) => <tr key={noticeKey(notice)} onClick={() => setSelected(notice)} className={`cursor-pointer border-l-2 align-top hover:bg-inset lg:align-middle ${notice.critical && !isLifted(notice) ? "border-l-rose-400/70" : "border-l-transparent"}`}>
            <td className="hidden px-4 py-3 wrap-anywhere lg:table-cell"><div className="text-xs font-bold">{notice.pipeline}</div><div className="mt-1 font-mono text-xs text-faint">#{notice.id}</div></td>
            <td className="px-3 py-3 wrap-anywhere lg:px-4">
              <div className="mb-1 text-xs text-soft lg:hidden">{notice.pipeline} <span className="font-mono text-faint">#{notice.id}</span></div>
              <button type="button" className="text-left text-sm font-semibold text-slate-100 hover:text-signal" onClick={(event) => { event.stopPropagation(); setSelected(notice); }}>{notice.title}</button>
              <div className="mt-2 space-y-1 text-xs text-soft lg:hidden">
                <div>Effective: {windowLabel(notice)}</div>
                <div>Posted: {stamp(notice.postedAt)} CT</div>
                <span className="inline-block" onClick={(event) => event.stopPropagation()}><Source url={notice.sourceUrl} title={notice.title} /></span>
              </div>
            </td>
            <td className="px-3 py-3 lg:px-4"><Badge notice={notice} /></td>
            <td className="hidden px-4 py-3 text-xs leading-5 text-soft lg:table-cell">{windowLabel(notice)}</td>
            <td className="hidden px-4 py-3 text-xs leading-5 text-soft lg:table-cell">{stamp(notice.postedAt)}</td>
            <td className="hidden px-4 py-3 lg:table-cell" onClick={(event) => event.stopPropagation()}><Source url={notice.sourceUrl} title={notice.title} /></td>
          </tr>)}</tbody>
        </table>
        : <div className="grid gap-3 p-3 md:grid-cols-2 md:p-4 xl:grid-cols-3">{visible.map((notice) => <article key={noticeKey(notice)} className={`flex min-w-0 flex-col gap-2 rounded-lg border border-line border-l-2 bg-inset p-3 wrap-anywhere sm:p-4 ${notice.critical && !isLifted(notice) ? "border-l-rose-400/70" : ""}`}>
          <div className="flex justify-between gap-2 text-xs text-soft"><span>{notice.pipeline}</span><span className="font-mono">#{notice.id}</span></div>
          <button type="button" className="text-left text-base font-bold hover:text-signal" onClick={() => setSelected(notice)}>{notice.title}</button>
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
    {selected && <Drawer notice={selected} position={selectedIndex} total={filtered.length} step={stepSelected} close={() => setSelected(null)} />}
  </>;
}

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { and, eq, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { drizzle as drizzleSqlite, type AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { BoardStatus, Notice } from "./model";
import * as pg from "./schema-pg";
import * as sqlite from "./schema-sqlite";

const initialSchema = [
  `CREATE TABLE IF NOT EXISTS notices (
    board TEXT NOT NULL, pipeline TEXT NOT NULL, notice_id TEXT NOT NULL, title TEXT NOT NULL, source_type TEXT NOT NULL,
    critical INTEGER NOT NULL, posted_at TEXT, effective_from TEXT, effective_through TEXT, source_url TEXT NOT NULL,
    body TEXT NOT NULL, hash TEXT NOT NULL, category TEXT NOT NULL, emergency INTEGER NOT NULL, tolerances TEXT NOT NULL,
    PRIMARY KEY (board, pipeline, notice_id)
  )`,
  `CREATE TABLE IF NOT EXISTS board_status (
    board TEXT NOT NULL PRIMARY KEY, last_attempt TEXT NOT NULL, last_success TEXT, error TEXT, count INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS sweep_lock (name TEXT NOT NULL PRIMARY KEY, owner TEXT NOT NULL, expires TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS feed_meta (name TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL)`,
];

export const retentionDays = 90;

async function connect() {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (databaseUrl) {
    const client = postgres(databaseUrl, { max: 4, prepare: false, idle_timeout: 20 });
    try {
      await client.begin(async (transaction) => {
        await transaction`SELECT pg_advisory_xact_lock(662751904)`;
        for (const statement of initialSchema) await transaction.unsafe(statement);
      });
      return { kind: "pg" as const, db: drizzlePg(client) };
    } catch (error) {
      await client.end();
      throw error;
    }
  }
  if (process.env.VERCEL) throw new Error("Set DATABASE_URL or POSTGRES_URL to a persistent PostgreSQL database on Vercel.");
  const filename = resolve(/* turbopackIgnore: true */ process.env.SQLITE_PATH || ".data/notices.sqlite");
  mkdirSync(dirname(filename), { recursive: true });
  const client = new DatabaseSync(filename);
  client.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
  for (const statement of initialSchema) client.exec(statement);
  function execute(query: string, params: SQLInputValue[], method: Parameters<AsyncRemoteCallback>[2]) {
    const statement = client.prepare(query);
    if (method === "run") {
      statement.run(...params);
      return { rows: [] };
    }
    if (method === "get") {
      const row = statement.get(...params);
      return { rows: row ? Object.values(row) : [] };
    }
    return { rows: statement.all(...params).map((row) => Object.values(row)) };
  }
  const db = drizzleSqlite(async (query, params, method) => execute(query, params, method), async (queries) => {
    client.exec("BEGIN IMMEDIATE");
    try {
      const results = queries.map(({ sql, params, method }) => execute(sql, params, method));
      client.exec("COMMIT");
      return results;
    } catch (error) {
      client.exec("ROLLBACK");
      throw error;
    }
  });
  return { kind: "sqlite" as const, db };
}

const shared = globalThis as typeof globalThis & { ebbDb?: ReturnType<typeof connect> };
function database() {
  return shared.ebbDb ??= connect().catch((error) => {
    delete shared.ebbDb;
    throw error;
  });
}

function noticeOrder<T>(postedAt: T) {
  return sql`coalesce(${postedAt}, '') desc`;
}

const revisionKey = "revision";
const cache = globalThis as typeof globalThis & { ebbFeed?: { revision: string; notices: Promise<Notice[]> } };

export async function readFeedVersion() {
  const connection = await database();
  const [revision, status] = connection.kind === "pg"
    ? await Promise.all([
      connection.db.select({ value: pg.meta.value }).from(pg.meta).where(eq(pg.meta.name, revisionKey)),
      connection.db.select().from(pg.status).orderBy(pg.status.board),
    ])
    : await Promise.all([
      connection.db.select({ value: sqlite.meta.value }).from(sqlite.meta).where(eq(sqlite.meta.name, revisionKey)).all(),
      connection.db.select().from(sqlite.status).orderBy(sqlite.status.board).all(),
    ]);
  return { revision: revision[0]?.value ?? "", status };
}

async function selectNotices() {
  const connection = await database();
  const rows = connection.kind === "pg"
    ? await connection.db.select().from(pg.notices).orderBy(noticeOrder(pg.notices.postedAt))
    : await connection.db.select().from(sqlite.notices).orderBy(noticeOrder(sqlite.notices.postedAt)).all();
  return rows.map((row): Notice => ({
    ...row, critical: Boolean(row.critical), emergency: Boolean(row.emergency), tolerances: JSON.parse(row.tolerances),
  }));
}

export function readNotices(revision: string) {
  if (cache.ebbFeed?.revision !== revision) {
    const notices = selectNotices();
    cache.ebbFeed = { revision, notices };
    notices.catch(() => {
      if (cache.ebbFeed?.notices === notices) delete cache.ebbFeed;
    });
  }
  return cache.ebbFeed.notices;
}

export async function readFeed() {
  const { revision, status } = await readFeedVersion();
  return { notices: await readNotices(revision), status };
}

function nextRevision() {
  const value = randomUUID();
  return { name: revisionKey, value };
}

function cachedFields(notice: Notice) {
  return {
    hash: notice.hash, category: notice.category, critical: Number(notice.critical), emergency: Number(notice.emergency),
    tolerances: JSON.stringify(notice.tolerances), effectiveFrom: notice.effectiveFrom, effectiveThrough: notice.effectiveThrough,
  };
}

function cacheDiffers(table: typeof pg.notices | typeof sqlite.notices, row: ReturnType<typeof cachedFields>) {
  return or(
    ne(table.hash, row.hash), ne(table.category, row.category), ne(table.critical, row.critical),
    ne(table.emergency, row.emergency), ne(table.tolerances, row.tolerances),
    sql`${table.effectiveFrom} IS DISTINCT FROM ${row.effectiveFrom}`,
    sql`${table.effectiveThrough} IS DISTINCT FROM ${row.effectiveThrough}`,
  );
}

function staleNotices(table: typeof pg.notices | typeof sqlite.notices, notices: Notice[], status: BoardStatus) {
  if (status.error || !notices.length) return null;
  const cutoff = new Date(Date.parse(status.lastAttempt) - retentionDays * 86_400_000).toISOString();
  return and(
    eq(table.board, status.board),
    notInArray(sql`${table.pipeline} || '|' || ${table.id}`, notices.map((notice) => `${notice.pipeline}|${notice.id}`)),
    sql`${table.postedAt} < ${cutoff}`,
    sql`${table.effectiveThrough} < ${cutoff}`,
  );
}

export async function saveBoard(notices: Notice[], status: BoardStatus) {
  const connection = await database();
  const rows = notices.map((notice) => ({ ...notice, ...cachedFields(notice) }));
  const { board, lastSuccess, ...result } = status;
  const revision = nextRevision();
  if (connection.kind === "pg") {
    await connection.db.transaction(async (tx) => {
      for (const row of rows) {
        await tx.insert(pg.notices).values(row).onConflictDoUpdate({
          target: [pg.notices.board, pg.notices.pipeline, pg.notices.id], set: row, setWhere: cacheDiffers(pg.notices, row),
        });
      }
      const stale = staleNotices(pg.notices, notices, status);
      if (stale) await tx.delete(pg.notices).where(stale);
      await tx.insert(pg.status).values(status).onConflictDoUpdate({
        target: pg.status.board, set: { ...result, ...(lastSuccess ? { lastSuccess } : {}) },
      });
      await tx.insert(pg.meta).values(revision).onConflictDoUpdate({ target: pg.meta.name, set: revision });
    });
  } else {
    const stale = staleNotices(sqlite.notices, notices, status);
    await connection.db.batch([
      connection.db.insert(sqlite.status).values({ board, lastSuccess, ...result }).onConflictDoUpdate({
        target: sqlite.status.board, set: { ...result, ...(lastSuccess ? { lastSuccess } : {}) },
      }),
      ...rows.map((row) => connection.db.insert(sqlite.notices).values(row).onConflictDoUpdate({
        target: [sqlite.notices.board, sqlite.notices.pipeline, sqlite.notices.id], set: row, setWhere: cacheDiffers(sqlite.notices, row),
      })),
      ...(stale ? [connection.db.delete(sqlite.notices).where(stale)] : []),
      connection.db.insert(sqlite.meta).values(revision).onConflictDoUpdate({ target: sqlite.meta.name, set: revision }),
    ]);
  }
}

export async function updateCachedNotice(previousHash: string, notice: Notice) {
  const connection = await database();
  const result = cachedFields(notice);
  function matches(table: typeof pg.notices | typeof sqlite.notices) {
    return and(
      eq(table.board, notice.board), eq(table.pipeline, notice.pipeline), eq(table.id, notice.id), eq(table.hash, previousHash),
      cacheDiffers(table, result),
    );
  }
  const updated = connection.kind === "pg"
    ? await connection.db.update(pg.notices).set(result).where(matches(pg.notices)).returning({ id: pg.notices.id })
    : await connection.db.update(sqlite.notices).set(result).where(matches(sqlite.notices)).returning({ id: sqlite.notices.id }).all();
  if (!updated.length) return false;
  const revision = nextRevision();
  if (connection.kind === "pg") {
    await connection.db.insert(pg.meta).values(revision).onConflictDoUpdate({ target: pg.meta.name, set: revision });
  } else {
    await connection.db.insert(sqlite.meta).values(revision).onConflictDoUpdate({ target: sqlite.meta.name, set: revision }).run();
  }
  return true;
}

export async function claimSweep(owner: string) {
  const connection = await database();
  const row = { name: "notices", owner, expires: new Date(Date.now() + 330_000).toISOString() };
  const now = new Date().toISOString();
  const acquired = connection.kind === "pg"
    ? await connection.db.insert(pg.lock).values(row).onConflictDoUpdate({
      target: pg.lock.name, set: row, setWhere: lt(pg.lock.expires, now),
    }).returning()
    : await connection.db.insert(sqlite.lock).values(row).onConflictDoUpdate({
      target: sqlite.lock.name, set: row, setWhere: lt(sqlite.lock.expires, now),
    }).returning().all();
  return acquired.length > 0;
}

const cooldownKey = "manual-sweep-cooldown";

export async function sweepCooldownSeconds() {
  const connection = await database();
  const rows = connection.kind === "pg"
    ? await connection.db.select().from(pg.lock).where(eq(pg.lock.name, cooldownKey))
    : await connection.db.select().from(sqlite.lock).where(eq(sqlite.lock.name, cooldownKey)).all();
  return rows.length ? Math.max(0, Math.ceil((Date.parse(rows[0].expires) - Date.now()) / 1000)) : 0;
}

export async function recordSweepFinish() {
  const connection = await database();
  const row = { name: cooldownKey, owner: "", expires: new Date(Date.now() + 300_000).toISOString() };
  if (connection.kind === "pg") {
    await connection.db.insert(pg.lock).values(row).onConflictDoUpdate({ target: pg.lock.name, set: row });
  } else {
    await connection.db.insert(sqlite.lock).values(row).onConflictDoUpdate({ target: sqlite.lock.name, set: row }).run();
  }
}

export async function releaseSweep(owner: string) {
  const connection = await database();
  if (connection.kind === "pg") {
    await connection.db.delete(pg.lock).where(and(eq(pg.lock.name, "notices"), eq(pg.lock.owner, owner)));
  } else {
    await connection.db.delete(sqlite.lock).where(and(eq(sqlite.lock.name, "notices"), eq(sqlite.lock.owner, owner))).run();
  }
}

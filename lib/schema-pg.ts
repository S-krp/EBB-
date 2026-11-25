import { integer, primaryKey, pgTable, text } from "drizzle-orm/pg-core";
import type { BoardId, Category } from "./model";

export const notices = pgTable("notices", {
  board: text("board").$type<BoardId>().notNull(),
  pipeline: text("pipeline").notNull(),
  id: text("notice_id").notNull(),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull(),
  critical: integer("critical").notNull(),
  postedAt: text("posted_at"),
  effectiveFrom: text("effective_from"),
  effectiveThrough: text("effective_through"),
  sourceUrl: text("source_url").notNull(),
  body: text("body").notNull(),
  bodyBlocks: text("body_blocks"),
  hash: text("hash").notNull(),
  category: text("category").$type<Category>().notNull(),
  emergency: integer("emergency").notNull(),
  tolerances: text("tolerances").notNull(),
}, (t) => [primaryKey({ columns: [t.board, t.pipeline, t.id] })]);

export const status = pgTable("board_status", {
  board: text("board").$type<BoardId>().primaryKey().notNull(),
  lastAttempt: text("last_attempt").notNull(),
  lastSuccess: text("last_success"),
  error: text("error"),
  count: integer("count").notNull().default(0),
});

export const lock = pgTable("sweep_lock", {
  name: text("name").primaryKey().notNull(),
  owner: text("owner").notNull(),
  expires: text("expires").notNull(),
});

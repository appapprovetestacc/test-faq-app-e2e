// Inlined migration SQL as TS consts. Cloudflare Workers' esbuild has no
// .sql loader configured — `import sql from './x.sql?raw'` fails the
// deploy. Each migration in drizzle/*.sql is mirrored here so the Worker
// can apply pending migrations at first request. Keep this file in
// lockstep with drizzle/meta/_journal.json.

export interface Migration {
  idx: number;
  tag: string;
  sql: string;
}

const MIGRATION_0000 = `
CREATE TABLE IF NOT EXISTS faq_categories (
  id            TEXT PRIMARY KEY NOT NULL,
  shop_domain   TEXT NOT NULL,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  UNIQUE (shop_domain, slug)
);
CREATE INDEX IF NOT EXISTS idx_faq_categories_shop ON faq_categories (shop_domain);

CREATE TABLE IF NOT EXISTS faq_entries (
  id              TEXT PRIMARY KEY NOT NULL,
  shop_domain     TEXT NOT NULL,
  category_id     TEXT NOT NULL,
  question        TEXT NOT NULL,
  answer_html     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'published',
  position        INTEGER NOT NULL DEFAULT 0,
  view_count      INTEGER NOT NULL DEFAULT 0,
  helpful_count   INTEGER NOT NULL DEFAULT 0,
  unhelpful_count INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  FOREIGN KEY (category_id) REFERENCES faq_categories(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_faq_entries_shop ON faq_entries (shop_domain);
CREATE INDEX IF NOT EXISTS idx_faq_entries_category ON faq_entries (category_id);
CREATE INDEX IF NOT EXISTS idx_faq_entries_status ON faq_entries (shop_domain, status);

CREATE TABLE IF NOT EXISTS faq_votes (
  id          TEXT PRIMARY KEY NOT NULL,
  entry_id    TEXT NOT NULL,
  vote        TEXT NOT NULL,
  voted_at    INTEGER NOT NULL,
  customer_id TEXT,
  anon_token  TEXT,
  FOREIGN KEY (entry_id) REFERENCES faq_entries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_faq_votes_entry ON faq_votes (entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_faq_votes_anon ON faq_votes (entry_id, anon_token) WHERE anon_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS faq_views_daily (
  shop_domain TEXT NOT NULL,
  entry_id    TEXT NOT NULL,
  day         TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entry_id, day),
  FOREIGN KEY (entry_id) REFERENCES faq_entries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_faq_views_shop_day ON faq_views_daily (shop_domain, day);

CREATE TABLE IF NOT EXISTS faq_settings (
  shop_domain        TEXT PRIMARY KEY NOT NULL,
  default_category   TEXT,
  search_enabled     INTEGER NOT NULL DEFAULT 1,
  max_answer_length  INTEGER NOT NULL DEFAULT 4000,
  updated_at         INTEGER NOT NULL
);
`;

export const MIGRATIONS: Migration[] = [
  { idx: 0, tag: "0000_faq_init", sql: MIGRATION_0000 },
];

// Splits a multi-statement migration into individual SQL statements that
// D1's `prepare()` can take one at a time. D1 doesn't accept multi-statement
// strings via prepare — each `CREATE TABLE` / `CREATE INDEX` needs its own
// call. The split is intentionally naive (single quotes + semicolons aren't
// nested in our DDL, so no string-escape handling needed).
export function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^--/.test(s));
}

let migratedFor: WeakSet<D1Database> | null = null;

export async function runMigrations(db: D1Database): Promise<void> {
  // Per-isolate idempotency. D1's CREATE TABLE IF NOT EXISTS handles
  // multi-isolate races safely, but skipping the repeat work each request
  // is still worth a WeakSet lookup.
  if (!migratedFor) migratedFor = new WeakSet();
  if (migratedFor.has(db)) return;

  for (const m of MIGRATIONS) {
    for (const stmt of splitStatements(m.sql)) {
      await db.prepare(stmt).run();
    }
  }
  migratedFor.add(db);
}

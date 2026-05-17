-- FAQ blueprint — initial schema. Mirrored as a TS const in
-- app/db/migrations.ts so the Worker bundle can execute it at runtime
-- (esbuild has no `?raw` SQL loader). Keep the two in sync — the .sql
-- file is the source of record for Drizzle Studio + future migrations;
-- the TS const is what `runMigrations()` actually applies.

CREATE TABLE IF NOT EXISTS faq_categories (
  id            TEXT PRIMARY KEY NOT NULL,
  shop_domain   TEXT NOT NULL,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  UNIQUE (shop_domain, slug)
);

CREATE INDEX IF NOT EXISTS idx_faq_categories_shop
  ON faq_categories (shop_domain);

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

CREATE INDEX IF NOT EXISTS idx_faq_entries_shop
  ON faq_entries (shop_domain);
CREATE INDEX IF NOT EXISTS idx_faq_entries_category
  ON faq_entries (category_id);
CREATE INDEX IF NOT EXISTS idx_faq_entries_status
  ON faq_entries (shop_domain, status);

CREATE TABLE IF NOT EXISTS faq_votes (
  id          TEXT PRIMARY KEY NOT NULL,
  entry_id    TEXT NOT NULL,
  vote        TEXT NOT NULL,
  voted_at    INTEGER NOT NULL,
  customer_id TEXT,
  anon_token  TEXT,
  FOREIGN KEY (entry_id) REFERENCES faq_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_faq_votes_entry
  ON faq_votes (entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_faq_votes_anon
  ON faq_votes (entry_id, anon_token)
  WHERE anon_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS faq_views_daily (
  shop_domain TEXT NOT NULL,
  entry_id    TEXT NOT NULL,
  day         TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entry_id, day),
  FOREIGN KEY (entry_id) REFERENCES faq_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_faq_views_shop_day
  ON faq_views_daily (shop_domain, day);

CREATE TABLE IF NOT EXISTS faq_settings (
  shop_domain        TEXT PRIMARY KEY NOT NULL,
  default_category   TEXT,
  search_enabled     INTEGER NOT NULL DEFAULT 1,
  max_answer_length  INTEGER NOT NULL DEFAULT 4000,
  updated_at         INTEGER NOT NULL
);

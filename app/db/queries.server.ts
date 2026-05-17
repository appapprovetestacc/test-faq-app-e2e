// Raw D1 query helpers. Each helper auto-runs pending migrations so
// loaders/actions don't have to think about cold-start ordering.
import { runMigrations } from "./migrations";

export interface FaqCategory {
  id: string;
  shop_domain: string;
  name: string;
  slug: string;
  position: number;
  created_at: number;
}

export interface FaqEntry {
  id: string;
  shop_domain: string;
  category_id: string;
  question: string;
  answer_html: string;
  status: "published" | "draft" | "hidden";
  position: number;
  view_count: number;
  helpful_count: number;
  unhelpful_count: number;
  created_at: number;
  updated_at: number;
}

export interface FaqSettings {
  shop_domain: string;
  default_category: string | null;
  search_enabled: number;
  max_answer_length: number;
  updated_at: number;
}

export interface FaqDailyView {
  day: string;
  count: number;
}

async function ready(db: D1Database) {
  await runMigrations(db);
}

export async function listCategories(
  db: D1Database,
  shop: string,
): Promise<FaqCategory[]> {
  await ready(db);
  const res = await db
    .prepare(
      "SELECT id, shop_domain, name, slug, position, created_at FROM faq_categories WHERE shop_domain = ? ORDER BY position ASC, created_at ASC",
    )
    .bind(shop)
    .all<FaqCategory>();
  return res.results ?? [];
}

export async function getCategoryBySlug(
  db: D1Database,
  shop: string,
  slug: string,
): Promise<FaqCategory | null> {
  await ready(db);
  const row = await db
    .prepare(
      "SELECT id, shop_domain, name, slug, position, created_at FROM faq_categories WHERE shop_domain = ? AND slug = ?",
    )
    .bind(shop, slug)
    .first<FaqCategory>();
  return row ?? null;
}

export async function createCategory(
  db: D1Database,
  input: { id: string; shop: string; name: string; slug: string; position: number },
): Promise<void> {
  await ready(db);
  await db
    .prepare(
      "INSERT INTO faq_categories (id, shop_domain, name, slug, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(input.id, input.shop, input.name, input.slug, input.position, Date.now())
    .run();
}

export async function updateCategory(
  db: D1Database,
  input: { id: string; shop: string; name: string; slug: string },
): Promise<void> {
  await ready(db);
  await db
    .prepare(
      "UPDATE faq_categories SET name = ?, slug = ? WHERE id = ? AND shop_domain = ?",
    )
    .bind(input.name, input.slug, input.id, input.shop)
    .run();
}

export async function deleteCategory(
  db: D1Database,
  shop: string,
  id: string,
): Promise<void> {
  await ready(db);
  await db
    .prepare("DELETE FROM faq_categories WHERE id = ? AND shop_domain = ?")
    .bind(id, shop)
    .run();
}

export async function listEntries(
  db: D1Database,
  shop: string,
  filter?: { status?: "published" | "draft" | "hidden"; categoryId?: string },
): Promise<FaqEntry[]> {
  await ready(db);
  const where: string[] = ["shop_domain = ?"];
  const binds: (string | number)[] = [shop];
  if (filter?.status) {
    where.push("status = ?");
    binds.push(filter.status);
  }
  if (filter?.categoryId) {
    where.push("category_id = ?");
    binds.push(filter.categoryId);
  }
  const sql = `SELECT id, shop_domain, category_id, question, answer_html, status, position, view_count, helpful_count, unhelpful_count, created_at, updated_at FROM faq_entries WHERE ${where.join(" AND ")} ORDER BY position ASC, created_at ASC`;
  const res = await db.prepare(sql).bind(...binds).all<FaqEntry>();
  return res.results ?? [];
}

export async function getEntry(
  db: D1Database,
  shop: string,
  id: string,
): Promise<FaqEntry | null> {
  await ready(db);
  const row = await db
    .prepare(
      "SELECT id, shop_domain, category_id, question, answer_html, status, position, view_count, helpful_count, unhelpful_count, created_at, updated_at FROM faq_entries WHERE id = ? AND shop_domain = ?",
    )
    .bind(id, shop)
    .first<FaqEntry>();
  return row ?? null;
}

export async function getEntryPublic(
  db: D1Database,
  shop: string,
  id: string,
): Promise<FaqEntry | null> {
  await ready(db);
  const row = await db
    .prepare(
      "SELECT id, shop_domain, category_id, question, answer_html, status, position, view_count, helpful_count, unhelpful_count, created_at, updated_at FROM faq_entries WHERE id = ? AND shop_domain = ? AND status = 'published'",
    )
    .bind(id, shop)
    .first<FaqEntry>();
  return row ?? null;
}

export async function createEntry(
  db: D1Database,
  input: {
    id: string;
    shop: string;
    categoryId: string;
    question: string;
    answerHtml: string;
    status: "published" | "draft" | "hidden";
    position: number;
  },
): Promise<void> {
  await ready(db);
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO faq_entries (id, shop_domain, category_id, question, answer_html, status, position, view_count, helpful_count, unhelpful_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)",
    )
    .bind(
      input.id,
      input.shop,
      input.categoryId,
      input.question,
      input.answerHtml,
      input.status,
      input.position,
      now,
      now,
    )
    .run();
}

export async function updateEntry(
  db: D1Database,
  input: {
    id: string;
    shop: string;
    categoryId: string;
    question: string;
    answerHtml: string;
    status: "published" | "draft" | "hidden";
  },
): Promise<void> {
  await ready(db);
  await db
    .prepare(
      "UPDATE faq_entries SET category_id = ?, question = ?, answer_html = ?, status = ?, updated_at = ? WHERE id = ? AND shop_domain = ?",
    )
    .bind(
      input.categoryId,
      input.question,
      input.answerHtml,
      input.status,
      Date.now(),
      input.id,
      input.shop,
    )
    .run();
}

export async function deleteEntry(
  db: D1Database,
  shop: string,
  id: string,
): Promise<void> {
  await ready(db);
  await db
    .prepare("DELETE FROM faq_entries WHERE id = ? AND shop_domain = ?")
    .bind(id, shop)
    .run();
}

export async function recordView(
  db: D1Database,
  shop: string,
  entryId: string,
  isoDay: string,
): Promise<void> {
  await ready(db);
  await db.batch([
    db
      .prepare(
        "UPDATE faq_entries SET view_count = view_count + 1 WHERE id = ? AND shop_domain = ?",
      )
      .bind(entryId, shop),
    db
      .prepare(
        "INSERT INTO faq_views_daily (shop_domain, entry_id, day, count) VALUES (?, ?, ?, 1) ON CONFLICT(entry_id, day) DO UPDATE SET count = count + 1",
      )
      .bind(shop, entryId, isoDay),
  ]);
}

export async function recordVote(
  db: D1Database,
  input: {
    id: string;
    shop: string;
    entryId: string;
    vote: "up" | "down";
    anonToken: string;
  },
): Promise<{ ok: boolean; reason?: "duplicate" }> {
  await ready(db);
  try {
    await db
      .prepare(
        "INSERT INTO faq_votes (id, entry_id, vote, voted_at, anon_token) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(input.id, input.entryId, input.vote, Date.now(), input.anonToken)
      .run();
  } catch (err) {
    if (err instanceof Error && /UNIQUE/.test(err.message)) {
      return { ok: false, reason: "duplicate" };
    }
    throw err;
  }
  const col = input.vote === "up" ? "helpful_count" : "unhelpful_count";
  await db
    .prepare(
      `UPDATE faq_entries SET ${col} = ${col} + 1 WHERE id = ? AND shop_domain = ?`,
    )
    .bind(input.entryId, input.shop)
    .run();
  return { ok: true };
}

export async function entryViewsLast30Days(
  db: D1Database,
  shop: string,
  entryId: string,
): Promise<FaqDailyView[]> {
  await ready(db);
  const res = await db
    .prepare(
      "SELECT day, count FROM faq_views_daily WHERE shop_domain = ? AND entry_id = ? ORDER BY day DESC LIMIT 30",
    )
    .bind(shop, entryId)
    .all<FaqDailyView>();
  return (res.results ?? []).reverse();
}

export async function shopViewsLast30Days(
  db: D1Database,
  shop: string,
): Promise<number> {
  await ready(db);
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const row = await db
    .prepare(
      "SELECT COALESCE(SUM(count), 0) AS total FROM faq_views_daily WHERE shop_domain = ? AND day >= ?",
    )
    .bind(shop, cutoff)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export async function getSettings(
  db: D1Database,
  shop: string,
): Promise<FaqSettings> {
  await ready(db);
  const row = await db
    .prepare(
      "SELECT shop_domain, default_category, search_enabled, max_answer_length, updated_at FROM faq_settings WHERE shop_domain = ?",
    )
    .bind(shop)
    .first<FaqSettings>();
  if (row) return row;
  return {
    shop_domain: shop,
    default_category: null,
    search_enabled: 1,
    max_answer_length: 4000,
    updated_at: 0,
  };
}

export async function upsertSettings(
  db: D1Database,
  input: {
    shop: string;
    defaultCategory: string | null;
    searchEnabled: boolean;
    maxAnswerLength: number;
  },
): Promise<void> {
  await ready(db);
  await db
    .prepare(
      "INSERT INTO faq_settings (shop_domain, default_category, search_enabled, max_answer_length, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(shop_domain) DO UPDATE SET default_category = excluded.default_category, search_enabled = excluded.search_enabled, max_answer_length = excluded.max_answer_length, updated_at = excluded.updated_at",
    )
    .bind(
      input.shop,
      input.defaultCategory,
      input.searchEnabled ? 1 : 0,
      input.maxAnswerLength,
      Date.now(),
    )
    .run();
}

export async function countByStatus(
  db: D1Database,
  shop: string,
): Promise<{ total: number; published: number; draft: number; hidden: number; helpful: number; unhelpful: number }> {
  await ready(db);
  const row = await db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
        SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) AS hidden,
        COALESCE(SUM(helpful_count), 0) AS helpful,
        COALESCE(SUM(unhelpful_count), 0) AS unhelpful
       FROM faq_entries WHERE shop_domain = ?`,
    )
    .bind(shop)
    .first<{ total: number; published: number; draft: number; hidden: number; helpful: number; unhelpful: number }>();
  return {
    total: Number(row?.total ?? 0),
    published: Number(row?.published ?? 0),
    draft: Number(row?.draft ?? 0),
    hidden: Number(row?.hidden ?? 0),
    helpful: Number(row?.helpful ?? 0),
    unhelpful: Number(row?.unhelpful ?? 0),
  };
}

export async function countEntriesByCategory(
  db: D1Database,
  shop: string,
): Promise<Record<string, number>> {
  await ready(db);
  const res = await db
    .prepare(
      "SELECT category_id, COUNT(*) AS n FROM faq_entries WHERE shop_domain = ? GROUP BY category_id",
    )
    .bind(shop)
    .all<{ category_id: string; n: number }>();
  const out: Record<string, number> = {};
  for (const row of res.results ?? []) out[row.category_id] = Number(row.n);
  return out;
}

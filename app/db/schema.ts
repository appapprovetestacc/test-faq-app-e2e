// Drizzle table definitions for the FAQ blueprint. Used by Drizzle Studio
// and any future typed query helpers. Runtime queries (D1 prepare/bind)
// live in app/db/queries.ts and stay raw SQL — Drizzle's D1 adapter adds
// bundle weight we don't need for a handful of statements.
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const faqCategories = sqliteTable(
  "faq_categories",
  {
    id: text("id").primaryKey(),
    shopDomain: text("shop_domain").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    uniqShopSlug: uniqueIndex("uniq_faq_cat_shop_slug").on(t.shopDomain, t.slug),
  }),
);

export const faqEntries = sqliteTable("faq_entries", {
  id: text("id").primaryKey(),
  shopDomain: text("shop_domain").notNull(),
  categoryId: text("category_id").notNull(),
  question: text("question").notNull(),
  answerHtml: text("answer_html").notNull(),
  status: text("status", { enum: ["published", "draft", "hidden"] })
    .notNull()
    .default("published"),
  position: integer("position").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
  helpfulCount: integer("helpful_count").notNull().default(0),
  unhelpfulCount: integer("unhelpful_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const faqVotes = sqliteTable("faq_votes", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull(),
  vote: text("vote", { enum: ["up", "down"] }).notNull(),
  votedAt: integer("voted_at").notNull(),
  customerId: text("customer_id"),
  anonToken: text("anon_token"),
});

export const faqViewsDaily = sqliteTable("faq_views_daily", {
  shopDomain: text("shop_domain").notNull(),
  entryId: text("entry_id").notNull(),
  day: text("day").notNull(),
  count: integer("count").notNull().default(0),
});

export const faqSettings = sqliteTable("faq_settings", {
  shopDomain: text("shop_domain").primaryKey(),
  defaultCategory: text("default_category"),
  searchEnabled: integer("search_enabled").notNull().default(1),
  maxAnswerLength: integer("max_answer_length").notNull().default(4000),
  updatedAt: integer("updated_at").notNull(),
});

export type FaqCategoryRow = typeof faqCategories.$inferSelect;
export type FaqEntryRow = typeof faqEntries.$inferSelect;
export type FaqVoteRow = typeof faqVotes.$inferSelect;
export type FaqSettingsRow = typeof faqSettings.$inferSelect;

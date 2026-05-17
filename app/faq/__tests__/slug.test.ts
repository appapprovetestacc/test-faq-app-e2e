import test from "node:test";
import assert from "node:assert/strict";
import { ensureUniqueSlug, slugify } from "../slug";

test("slugify: lower-cases, collapses non-alnum, trims dashes", () => {
  assert.equal(slugify("Shipping & Returns!!!"), "shipping-returns");
  assert.equal(slugify("   hello   world   "), "hello-world");
});

test("slugify: transliterates German umlauts before stripping", () => {
  assert.equal(slugify("Größen & Maße"), "groessen-masse");
});

test("slugify: falls back to 'category' when input collapses to empty", () => {
  assert.equal(slugify("!!!"), "category");
  assert.equal(slugify(""), "category");
});

test("ensureUniqueSlug: returns base slug when no collision", () => {
  assert.equal(ensureUniqueSlug("Billing", new Set(["shipping", "support"])), "billing");
});

test("ensureUniqueSlug: appends incrementing suffix on collision", () => {
  const out = ensureUniqueSlug("billing", ["billing", "billing-2"]);
  assert.equal(out, "billing-3");
});

import test from "node:test";
import assert from "node:assert/strict";
import { rankDocuments, filterDocuments, type SearchDocument } from "../search";

const docs: SearchDocument[] = [
  {
    id: "a",
    question: "How do I cancel my subscription?",
    answerText: "Visit the billing page and click cancel.",
    categoryName: "Billing",
  },
  {
    id: "b",
    question: "When will my order ship?",
    answerText: "Most orders ship within 2 business days.",
    categoryName: "Shipping",
  },
  {
    id: "c",
    question: "How do I reset my password?",
    answerText: "Click forgot password on the login screen.",
    categoryName: "Account",
  },
];

test("rankDocuments: question matches outrank answer-only matches", () => {
  const ranked = rankDocuments("cancel", docs);
  assert.equal(ranked[0]?.id, "a");
});

test("rankDocuments: tolerates a single-character typo", () => {
  const ranked = rankDocuments("subscriiption", docs);
  assert.equal(ranked[0]?.id, "a", "typo'd query still finds the cancel-subscription entry");
});

test("rankDocuments: returns every doc with score 1 for an empty query", () => {
  const ranked = rankDocuments("   ", docs);
  assert.equal(ranked.length, docs.length);
  for (const r of ranked) assert.equal(r.score, 1);
});

test("filterDocuments: omits documents with no token match", () => {
  const out = filterDocuments("password", docs);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, "c");
});

test("rankDocuments: multi-token query scores compositely", () => {
  const ranked = rankDocuments("order ship", docs);
  assert.equal(ranked[0]?.id, "b");
});

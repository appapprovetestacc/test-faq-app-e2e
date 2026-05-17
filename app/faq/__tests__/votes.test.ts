import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateVotes,
  formatHelpfulPercent,
  summarizeVotes,
} from "../votes";

test("summarizeVotes: returns zeros for empty input", () => {
  const s = summarizeVotes({ helpful: 0, unhelpful: 0 });
  assert.equal(s.total, 0);
  assert.equal(s.helpfulRatio, 0);
  assert.equal(s.unhelpfulRatio, 0);
});

test("summarizeVotes: computes ratios over the total", () => {
  const s = summarizeVotes({ helpful: 3, unhelpful: 1 });
  assert.equal(s.total, 4);
  assert.equal(s.helpfulRatio, 0.75);
  assert.equal(s.unhelpfulRatio, 0.25);
});

test("summarizeVotes: floors negatives + fractional counts to safe non-negative ints", () => {
  const s = summarizeVotes({ helpful: -2, unhelpful: 1.7 });
  assert.equal(s.helpful, 0);
  assert.equal(s.unhelpful, 1);
  assert.equal(s.total, 1);
});

test("aggregateVotes: sums across entries", () => {
  const s = aggregateVotes([
    { helpful: 4, unhelpful: 1 },
    { helpful: 2, unhelpful: 3 },
    { helpful: 0, unhelpful: 0 },
  ]);
  assert.equal(s.helpful, 6);
  assert.equal(s.unhelpful, 4);
  assert.equal(s.total, 10);
  assert.equal(s.helpfulRatio, 0.6);
});

test("formatHelpfulPercent: em-dash for zero-vote entries", () => {
  assert.equal(formatHelpfulPercent(summarizeVotes({ helpful: 0, unhelpful: 0 })), "—");
  assert.equal(formatHelpfulPercent(summarizeVotes({ helpful: 3, unhelpful: 1 })), "75%");
});

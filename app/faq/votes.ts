// Vote-tally aggregation helpers. Kept pure so the same fn runs in:
//   1. the admin index loader (sum across the listed entries),
//   2. the per-entry detail page (single-entry breakdown), and
//   3. tests (no D1 mock needed — feed an array of counts in).

export interface VoteCounts {
  helpful: number;
  unhelpful: number;
}

export interface VoteSummary extends VoteCounts {
  total: number;
  helpfulRatio: number;
  unhelpfulRatio: number;
}

const EMPTY: VoteSummary = {
  helpful: 0,
  unhelpful: 0,
  total: 0,
  helpfulRatio: 0,
  unhelpfulRatio: 0,
};

export function summarizeVotes(counts: VoteCounts): VoteSummary {
  const helpful = Math.max(0, Math.trunc(counts.helpful));
  const unhelpful = Math.max(0, Math.trunc(counts.unhelpful));
  const total = helpful + unhelpful;
  if (total === 0) return EMPTY;
  return {
    helpful,
    unhelpful,
    total,
    helpfulRatio: helpful / total,
    unhelpfulRatio: unhelpful / total,
  };
}

export function aggregateVotes(entries: VoteCounts[]): VoteSummary {
  let helpful = 0;
  let unhelpful = 0;
  for (const e of entries) {
    helpful += Math.max(0, Math.trunc(e.helpful));
    unhelpful += Math.max(0, Math.trunc(e.unhelpful));
  }
  return summarizeVotes({ helpful, unhelpful });
}

export function formatHelpfulPercent(summary: VoteSummary): string {
  if (summary.total === 0) return "—";
  return `${Math.round(summary.helpfulRatio * 100)}%`;
}

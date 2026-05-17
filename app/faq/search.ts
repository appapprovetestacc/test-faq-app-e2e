// Lunr-style client-side fuzzy ranker for the FAQ search bar. Pure-fn so
// it ships unchanged to the browser bundle AND covers the server-rendered
// /apps/faq page (search-on-load via query param). No deps — fuse.js +
// lunr each add 30-40KB to the storefront bundle and we only need
// substring + prefix + edit-distance scoring.

export interface SearchDocument {
  id: string;
  question: string;
  answerText: string;
  categoryName?: string;
}

export interface SearchResult {
  id: string;
  score: number;
}

interface TokenStats {
  question: string;
  answer: string;
  category: string;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const v0: number[] = new Array(b.length + 1);
  const v1: number[] = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j]! + 1, v0[j + 1]! + 1, v0[j]! + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j]!;
  }
  return v0[b.length]!;
}

function tokenMatch(queryToken: string, target: string): number {
  if (target.includes(queryToken)) {
    if (target === queryToken) return 1;
    if (target.startsWith(queryToken)) return 0.85;
    return 0.7;
  }
  if (queryToken.length < 3) return 0;
  const dist = levenshtein(queryToken, target);
  const tolerance = queryToken.length <= 5 ? 1 : 2;
  if (dist <= tolerance) {
    return Math.max(0, 0.6 - dist * 0.15);
  }
  return 0;
}

function scoreField(queryTokens: string[], fieldTokens: string[]): number {
  if (queryTokens.length === 0 || fieldTokens.length === 0) return 0;
  let total = 0;
  for (const q of queryTokens) {
    let best = 0;
    for (const t of fieldTokens) {
      const s = tokenMatch(q, t);
      if (s > best) best = s;
      if (best === 1) break;
    }
    total += best;
  }
  return total / queryTokens.length;
}

function statsFor(doc: SearchDocument): TokenStats {
  return {
    question: doc.question.toLowerCase(),
    answer: doc.answerText.toLowerCase(),
    category: (doc.categoryName ?? "").toLowerCase(),
  };
}

export function rankDocuments(
  query: string,
  docs: SearchDocument[],
): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return docs.map((d) => ({ id: d.id, score: 1 }));
  const qTokens = tokenize(trimmed);
  if (qTokens.length === 0) return docs.map((d) => ({ id: d.id, score: 1 }));
  const out: SearchResult[] = [];
  for (const doc of docs) {
    const stats = statsFor(doc);
    const qScore = scoreField(qTokens, tokenize(stats.question));
    const aScore = scoreField(qTokens, tokenize(stats.answer));
    const cScore = scoreField(qTokens, tokenize(stats.category));
    // Weights: question dominates, answer secondary, category as tiebreaker.
    const composite = qScore * 1 + aScore * 0.5 + cScore * 0.25;
    if (composite > 0) out.push({ id: doc.id, score: composite });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function filterDocuments(
  query: string,
  docs: SearchDocument[],
): SearchDocument[] {
  const ranked = rankDocuments(query, docs);
  const byId = new Map(docs.map((d) => [d.id, d]));
  return ranked
    .map((r) => byId.get(r.id))
    .filter((d): d is SearchDocument => Boolean(d));
}

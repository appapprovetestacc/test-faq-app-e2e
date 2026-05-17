// Slug helpers — pure so they're unit-testable and shared between the
// admin editor (preview slug while typing) and the create-category
// action (collision-resolution against an existing slug list).

const DEFAULT_PREFIX = "category";

export function slugify(input: string): string {
  // Order matters: transliterate German umlauts BEFORE the NFKD normalize,
  // otherwise NFKD splits 'ö' into 'o' + combining diaeresis and the umlaut
  // replace clauses no longer match.
  const transliterated = input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
  const base = transliterated
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base.length > 0 ? base : DEFAULT_PREFIX;
}

// Returns a slug guaranteed to be unique against the `existing` set.
// Appends -2, -3, … on collision. The caller is responsible for
// re-fetching `existing` inside a transaction-equivalent if races
// matter (D1's UNIQUE constraint backstops anyway).
export function ensureUniqueSlug(
  candidate: string,
  existing: Iterable<string>,
): string {
  const set = new Set(existing);
  const base = slugify(candidate);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

import { normalizeArabic } from "./parsing/normalize";

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return m;
}

/**
 * Looser folding for "did you mean": drops the article «ال» and treats a
 * final ه/ة like ا (people type «دلتة» for «دلتا»), on top of normalizeArabic.
 */
function fold(s: string): string {
  return normalizeArabic(s)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/^(و?ال)(?=..)/, "").replace(/ه$/, "ا"))
    .join(" ");
}

/** Dice coefficient on character bigrams (0..1), after folding. */
export function similarity(a: string, b: string): number {
  const A = bigrams(fold(a));
  const B = bigrams(fold(b));
  let overlap = 0;
  let total = 0;
  for (const [k, n] of A) {
    overlap += Math.min(n, B.get(k) ?? 0);
    total += n;
  }
  for (const n of B.values()) total += n;
  return total ? (2 * overlap) / total : 0;
}

/** Best "did you mean" candidate, matching the query against each word of the labels. */
export function closest<T>(query: string, items: T[], labels: (item: T) => string[], min = 0.35): T | null {
  let best: T | null = null;
  let score = min;
  for (const item of items) {
    for (const label of labels(item)) {
      for (const part of [label, ...label.split(/\s+/)]) {
        const s = similarity(query, part);
        if (s > score) {
          score = s;
          best = item;
        }
      }
    }
  }
  return best;
}

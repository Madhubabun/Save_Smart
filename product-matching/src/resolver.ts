import type { CatalogProduct, MatchConfidence, Size } from '@savesmart/shared';
import type { ParsedLine } from './listParser.js';
import { tokenize, tokenMatches } from './text.js';
import { packMultiple, sameSize } from './units.js';

export interface SearchHit {
  product: CatalogProduct;
  /** Ranking score, including popularity. */
  score: number;
  /** How well the words match, ignoring popularity. Used to judge ambiguity. */
  relevance: number;
}

function searchTokens(p: CatalogProduct): string[] {
  return tokenize(`${p.brand} ${p.name} ${p.variant} ${p.keywords.join(' ')}`);
}

/**
 * Ranks catalog products for a free-text query. Every query word must match
 * something about the product (brand, name, variant or a synonym), allowing
 * prefixes and one-letter typos. Size words are ignored here.
 */
export function searchCatalog(query: string, catalog: CatalogProduct[], limit = 20): SearchHit[] {
  const q = tokenize(query);
  if (q.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const product of catalog) {
    const tokens = searchTokens(product);
    const nameTokens = new Set(tokenize(`${product.brand} ${product.name} ${product.variant}`));
    let matched = 0;
    let exactName = 0;
    for (const qt of q) {
      if (tokens.some((t) => tokenMatches(qt, t))) matched++;
      if (nameTokens.has(qt)) exactName++;
    }
    if (matched < q.length) continue;
    // Coverage of the product name by the query lets "Amul Gold" beat "Amul Taaza" for that query.
    const coverage = exactName / Math.max(nameTokens.size, 1);
    // Product names end with their head noun ("Taaza Toned Milk"), so "milk" should
    // prefer actual milk over "Milk Bikis" biscuits.
    const nameWords = tokenize(product.name);
    const headNoun = nameWords[nameWords.length - 1];
    // Synonyms ("aloo" for potato, "soap" for a bathing bar) count like the head noun.
    const synonyms = new Set(product.keywords.flatMap((k) => tokenize(k)));
    const headBoost = q.some((qt) => qt === headNoun || synonyms.has(qt)) ? 0.15 : 0;
    const relevance = 0.6 + headBoost + 0.15 * coverage;
    const score = relevance + 0.1 * (product.popularity / 100);
    hits.push({ product, score: Math.round(score * 1000) / 1000, relevance: Math.round(relevance * 1000) / 1000 });
  }
  return hits.sort((a, b) => b.score - a.score || b.product.popularity - a.product.popularity).slice(0, limit);
}

export interface Resolution {
  product: CatalogProduct | null;
  quantity: number;
  confidence: MatchConfidence;
  alternatives: CatalogProduct[];
  note?: string;
}

/**
 * Turns a parsed shopping-list line into a concrete catalog product and a pack quantity.
 *
 * - "Tomatoes 1kg" picks the 1 kg pack; "Tomatoes 2kg" becomes 2 × 1 kg when no 2 kg pack exists.
 * - "Eggs 12" picks the 12-piece tray (1 pack), not twelve trays.
 * - "Milk 2" is ambiguous across brands, so the most popular is suggested with low confidence
 *   and the alternatives are returned for the user to confirm.
 */
export function resolveLine(line: ParsedLine, catalog: CatalogProduct[]): Resolution {
  const hits = searchCatalog(line.name, catalog, 50);
  if (hits.length === 0) {
    return { product: null, quantity: line.quantity, confidence: 'none', alternatives: [], note: `No product found for "${line.name}".` };
  }

  let pool = hits;
  let quantity = line.quantity;
  let note: string | undefined;

  if (line.size) {
    const wanted: Size = { value: line.size.value * line.packCount, unit: line.size.unit };
    const exact = hits.filter((h) => sameSize(h.product.size, wanted) && h.product.packCount === 1);
    if (exact.length) {
      pool = exact;
    } else {
      // Largest pack that divides the requested amount exactly.
      const divisible = hits
        .map((h) => ({ h, m: h.product.packCount === 1 ? packMultiple(wanted, h.product.size) : null }))
        .filter((x): x is { h: SearchHit; m: number } => x.m !== null)
        .sort((a, b) => a.m - b.m);
      if (divisible.length) {
        const m = divisible[0].m;
        pool = divisible.filter((d) => d.m === m).map((d) => d.h);
        quantity = line.quantity * m;
        note = `No single ${formatWanted(wanted)} pack, so using ${m} × ${formatWanted(pool[0].product.size)}.`;
      } else {
        note = `No ${formatWanted(wanted)} pack found; showing the closest sizes.`;
      }
    }
  } else if (line.bareNumber && line.quantity > 1) {
    // "Eggs 12": a bare number that equals a piece-count pack size means the pack, not the quantity.
    const piecePacks = hits.filter((h) => h.product.size.unit === 'pcs' && h.product.size.value === line.quantity);
    if (piecePacks.length && line.quantity >= 4) {
      pool = piecePacks;
      quantity = 1;
    }
  }

  const topRelevance = Math.max(...pool.map((h) => h.relevance));
  const contenders = pool.filter((h) => topRelevance - h.relevance < 0.04);
  const distinctLines = new Set(contenders.map((h) => `${h.product.brand}|${h.product.name}|${h.product.variant}`));
  const confidence: MatchConfidence = distinctLines.size === 1 ? 'high' : 'low';

  // Default pick: the best-scored, then the most popular among close contenders.
  const chosen = [...contenders].sort((a, b) => b.product.popularity - a.product.popularity)[0].product;

  const seen = new Set([chosen.id]);
  const alternatives: CatalogProduct[] = [];
  for (const h of [...contenders, ...pool, ...hits]) {
    if (alternatives.length >= 4) break;
    if (seen.has(h.product.id)) continue;
    seen.add(h.product.id);
    alternatives.push(h.product);
  }

  return { product: chosen, quantity, confidence, alternatives, note };
}

function formatWanted(size: Size): string {
  if (size.unit === 'g') return size.value >= 1000 ? `${size.value / 1000} kg` : `${size.value} g`;
  if (size.unit === 'ml') return size.value >= 1000 ? `${size.value / 1000} L` : `${size.value} ml`;
  return `${size.value} pcs`;
}

import { PLATFORMS, formatRupees, formatSize, round2, type CatalogProduct, type PlatformId, type SmartSwap } from '@savesmart/shared';
import { packMultiple, tokenize } from '@savesmart/product-matching';
import type { ListingMatch } from '@savesmart/product-matching';
import type { PlatformQuote } from './comparison.js';

/**
 * Products that can stand in for each other: same category and the same kind of thing, including its
 * variety ("Basmati Rice", "Toned Milk", "Brown Bread"). Only the brand and sub-brand may differ, so
 * basmati is never swapped for sona masoori and Good Day is never swapped for Parle-G.
 */
export function similarProducts(product: CatalogProduct, catalog: CatalogProduct[]): CatalogProduct[] {
  const kind = (p: CatalogProduct) => tokenize(p.name).slice(-2).join(' ');
  const k = kind(product);
  return catalog.filter(
    (p) => p.id !== product.id && p.category === product.category && kind(p) === k && p.size.unit === product.size.unit && p.packCount === product.packCount,
  );
}

/** Cheapest available price of one pack across platforms that answered. */
export function bestPrice(productId: string, quotes: PlatformQuote[]): { platform: PlatformId; price: number } | null {
  let best: { platform: PlatformId; price: number } | null = null;
  for (const q of quotes) {
    if (q.status !== 'ok') continue;
    const m: ListingMatch | null | undefined = q.matches.get(productId);
    if (!m || m.listing.availability === 'out_of_stock') continue;
    const price = round2(m.listing.price * m.multiplier);
    if (!best || price < best.price) best = { platform: q.platform, price };
  }
  return best;
}

const sameLine = (a: CatalogProduct, b: CatalogProduct) => a.brand === b.brand && a.name === b.name && a.variant === b.variant;

/**
 * Smart swap candidates: for each cart line, an equivalent amount of a different pack size
 * of the same product (2 × 500 ml instead of 1 L) or a similar product from
 * another brand that costs meaningfully less. Only exact equivalent amounts are
 * suggested, so the user never has to buy more than they asked for.
 * `estimatedSaving` here is the item-level saving; the comparison service re-prices
 * each candidate through the optimizer and keeps only those that lower the plan total.
 */
export function findSwaps(
  lines: { itemId: string; product: CatalogProduct; quantity: number }[],
  catalog: CatalogProduct[],
  quotes: PlatformQuote[],
): SmartSwap[] {
  const swaps: SmartSwap[] = [];
  const inCart = new Set(lines.map((l) => l.product.id));

  for (const line of lines) {
    const current = bestPrice(line.product.id, quotes);
    if (!current) continue;
    const fromTotal = round2(current.price * line.quantity);
    const needed = { value: line.product.size.value * line.quantity, unit: line.product.size.unit };

    let best: SmartSwap | null = null;
    for (const alt of similarProducts(line.product, catalog)) {
      if (inCart.has(alt.id)) continue;
      const packs = packMultiple(needed, alt.size);
      if (!packs || packs > 12) continue;
      const altPrice = bestPrice(alt.id, quotes);
      if (!altPrice) continue;
      const toTotal = round2(altPrice.price * packs);
      const saving = round2(fromTotal - toTotal);
      if (saving <= 0) continue;
      const kind = sameLine(alt, line.product) ? 'pack_size' : 'similar_product';
      const amount = formatSize(needed);
      const reason =
        kind === 'pack_size'
          ? `Same product, different pack: ${packs} × ${formatSize(alt.size)} is ${formatRupees(saving)} cheaper for ${amount}.`
          : `A similar ${tokenize(alt.name).at(-1)} from ${alt.brand || 'another brand'}: ${formatRupees(saving)} less for ${amount} on ${PLATFORMS[altPrice.platform].shortName}.`;
      if (!best || saving > best.estimatedSaving) {
        best = {
          itemId: line.itemId,
          kind,
          from: line.product,
          fromQuantity: line.quantity,
          to: alt,
          toQuantity: packs,
          fromBest: { platform: current.platform, total: fromTotal },
          toBest: { platform: altPrice.platform, total: toTotal },
          estimatedSaving: saving,
          reason,
        };
      }
    }
    if (best) swaps.push(best);
  }
  return swaps;
}

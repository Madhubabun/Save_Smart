import type { CatalogProduct, PlatformListing, Size } from '@savesmart/shared';
import { tokenize } from './text.js';
import { packMultiple, sameSize } from './units.js';

/** Score at or above which a listing is treated as the same product. */
export const MATCH_THRESHOLD = 0.72;

export interface ListingMatch {
  listing: PlatformListing;
  score: number;
  /**
   * exact: same product, same pack.
   * multiple: same product sold in a smaller pack; `multiplier` packs equal one requested pack
   * (e.g. 2 × 6 eggs for a 12-egg pack). Always surfaced to the user, never hidden.
   */
  kind: 'exact' | 'multiple';
  multiplier: number;
}

function brandTokens(brand: string): string[] {
  return tokenize(brand);
}

/** Tokens that identify the product line and variant (no brand, no size). */
export function productIdentityTokens(product: Pick<CatalogProduct, 'name' | 'variant'>): string[] {
  return Array.from(new Set(tokenize(`${product.name} ${product.variant}`)));
}

/**
 * Similarity between a canonical product and a platform listing, ignoring size.
 * Brand must agree; then we look at how much of the product's identity is present
 * in the listing (recall) and how much extra, unexplained wording the listing has
 * (precision). "Amul Gold" vs "Amul Taaza" fails on recall of "taaza".
 */
export function identityScore(product: CatalogProduct, listing: Pick<PlatformListing, 'productName' | 'brand'>): number {
  const title = tokenize(listing.productName);
  const titleSet = new Set(title);

  if (product.brand) {
    const wanted = brandTokens(product.brand);
    const listingBrand = brandTokens(listing.brand);
    const brandOk =
      wanted.every((t) => titleSet.has(t)) || (listingBrand.length > 0 && wanted.every((t) => listingBrand.includes(t)));
    if (!brandOk) return 0;
  }

  const identity = productIdentityTokens(product);
  if (identity.length === 0) return 0;
  const known = new Set([...identity, ...brandTokens(product.brand), ...product.keywords.flatMap((k) => tokenize(k))]);

  const recall = identity.filter((t) => titleSet.has(t)).length / identity.length;
  const extra = title.filter((t) => !known.has(t));
  const precision = title.length === 0 ? 0 : (title.length - extra.length) / title.length;

  return Math.round((0.75 * recall + 0.25 * precision) * 1000) / 1000;
}

function listingSize(listing: PlatformListing): Size {
  return { value: listing.quantity, unit: listing.unit };
}

/**
 * Finds the listing that represents `product` on a platform.
 *
 * A listing only counts as the same product when its normalized pack size is
 * identical: 500 ml never matches 1 L. If no identical pack exists, an exact
 * whole-number combination of a smaller pack of the same product (2 × 6 eggs
 * for 12 eggs) is accepted and reported as such.
 */
export function matchProduct(product: CatalogProduct, listings: PlatformListing[]): ListingMatch | null {
  let bestExact: ListingMatch | null = null;
  let bestMultiple: ListingMatch | null = null;

  for (const listing of listings) {
    const score = identityScore(product, listing);
    if (score < MATCH_THRESHOLD) continue;

    const size = listingSize(listing);
    if (sameSize(size, product.size) && listing.packCount === product.packCount) {
      if (!bestExact || score > bestExact.score || (score === bestExact.score && listing.price < bestExact.listing.price)) {
        bestExact = { listing, score, kind: 'exact', multiplier: 1 };
      }
      continue;
    }

    if (listing.packCount !== 1 || product.packCount !== 1) continue;
    const multiple = packMultiple(product.size, size);
    if (multiple && multiple > 1 && multiple <= 4) {
      const candidate: ListingMatch = { listing, score, kind: 'multiple', multiplier: multiple };
      if (!bestMultiple || listing.price * multiple < bestMultiple.listing.price * bestMultiple.multiplier) {
        bestMultiple = candidate;
      }
    }
  }

  if (bestExact && bestExact.listing.availability !== 'out_of_stock') return bestExact;
  if (bestMultiple && bestMultiple.listing.availability !== 'out_of_stock') return bestMultiple;
  return bestExact ?? bestMultiple;
}

/** Strict check used in tests and by the UI: do two listings describe the same purchasable pack? */
export function isSamePack(
  a: Pick<PlatformListing, 'quantity' | 'unit' | 'packCount'>,
  b: Pick<PlatformListing, 'quantity' | 'unit' | 'packCount'>,
): boolean {
  return sameSize({ value: a.quantity, unit: a.unit }, { value: b.quantity, unit: b.unit }) && a.packCount === b.packCount;
}

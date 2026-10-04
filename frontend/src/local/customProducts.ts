import type { CatalogProduct } from '@savesmart/shared';
import type { ParsedLine } from '@savesmart/product-matching';
import { storage } from '../lib/storage';

const KEY = 'ss.customProducts.v1';

/** Items from the user's own list that aren't in SaveSmart's product list, kept on this device. */
export const customProducts = {
  all: () => storage.getJSON<CatalogProduct[]>(KEY, []),

  create(parsed: ParsedLine): CatalogProduct {
    const name = cleanName(parsed.name || parsed.raw);
    const size = parsed.size ?? { value: 1, unit: 'pcs' as const };
    const id = `own-${slug(name)}-${size.value}${size.unit}`;
    const existing = customProducts.all().find((p) => p.id === id);
    if (existing) return existing;
    const product: CatalogProduct = {
      id,
      brand: '',
      name,
      variant: '',
      size,
      packCount: parsed.packCount ?? 1,
      category: 'Other',
      emoji: '🛍️',
      keywords: [],
      popularity: 50,
      mrp: 0,
    };
    storage.setJSON(KEY, [...customProducts.all(), product].slice(-300));
    return product;
  },
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'item';

function cleanName(s: string) {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

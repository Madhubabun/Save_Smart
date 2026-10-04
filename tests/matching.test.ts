import { describe, expect, it } from 'vitest';
import { parseLine, parseShoppingList, parseSize, resolveLine, sameSize } from '@savesmart/product-matching';
import { DEMO_CATALOG, DEFAULT_LOCATION, DemoDataProvider, createDemoAdapters } from '@savesmart/platform-adapters';

describe('size parsing and normalization', () => {
  it('normalizes units so "Amul Taaza 1L" and "Amul Taaza Milk 1000ml" have the same size', () => {
    expect(sameSize(parseSize('Amul Taaza 1L')!.size, parseSize('Amul Taaza Milk 1000ml')!.size)).toBe(true);
    expect(sameSize(parseSize('Amul Taaza Milk 500ml')!.size, parseSize('Amul Taaza 1L')!.size)).toBe(false);
  });

  it('understands kg, multipacks, pieces and dozens', () => {
    expect(parseSize('Rice 5 kg')!.size).toEqual({ value: 5000, unit: 'g' });
    expect(parseSize('Dove 4 x 100 g')).toMatchObject({ size: { value: 100, unit: 'g' }, packCount: 4 });
    expect(parseSize('Eggs 12 pcs')!.size).toEqual({ value: 12, unit: 'pcs' });
    expect(parseSize('1 dozen eggs')!.size).toEqual({ value: 12, unit: 'pcs' });
    expect(parseSize('half dozen bananas')!.size).toEqual({ value: 6, unit: 'pcs' });
    expect(parseSize('Oil 1.5 litre')!.size).toEqual({ value: 1500, unit: 'ml' });
  });
});

describe('shopping list parsing', () => {
  it('parses the MVP list into product, quantity and unit', () => {
    const lines = parseShoppingList('Milk 2\nBread 1\nEggs 12\nTomatoes 1kg\nRice 5kg\nBiscuits 2');
    expect(lines.map((l) => [l.name, l.quantity, l.size])).toEqual([
      ['Milk', 2, null],
      ['Bread', 1, null],
      ['Eggs', 12, null],
      ['Tomatoes', 1, { value: 1000, unit: 'g' }],
      ['Rice', 1, { value: 5000, unit: 'g' }],
      ['Biscuits', 2, null],
    ]);
  });

  it('handles bullets, commas, leading quantities and "x" multipliers', () => {
    expect(parseShoppingList('- milk 2, bread\n• 3 x onion 1kg\n2 Maggi')).toMatchObject([
      { name: 'milk', quantity: 2 },
      { name: 'bread', quantity: 1 },
      { name: 'onion', quantity: 3, size: { value: 1000, unit: 'g' } },
      { name: 'Maggi', quantity: 2 },
    ]);
    expect(parseLine('Amul Taaza Milk 1L x2')).toMatchObject({ name: 'Amul Taaza Milk', quantity: 2, size: { value: 1000, unit: 'ml' } });
  });
});

describe('resolving list lines to catalog products', () => {
  const resolve = (line: string) => resolveLine(parseLine(line), DEMO_CATALOG);

  it('reads "Eggs 12" as one 12-egg tray, not twelve trays', () => {
    const r = resolve('Eggs 12');
    expect(r.product?.id).toBe('white-eggs-12');
    expect(r.quantity).toBe(1);
  });

  it('picks the requested pack size and combines packs when needed', () => {
    expect(resolve('Tomatoes 1kg').product?.id).toBe('hybrid-tomato-1kg');
    const two = resolve('Tomatoes 2kg');
    expect(two.product?.id).toBe('hybrid-tomato-1kg');
    expect(two.quantity).toBe(2);
    expect(two.note).toMatch(/2 × 1 kg/);
  });

  it('asks for confirmation when a generic item is ambiguous', () => {
    const milk = resolve('Milk 2');
    expect(milk.product?.id).toBe('amul-taaza-1l');
    expect(milk.quantity).toBe(2);
    expect(milk.confidence).toBe('low');
    expect(milk.alternatives.map((a) => a.id)).toContain('amul-gold-1l');
  });

  it('is confident about specific products and tolerant of typos and Hindi names', () => {
    expect(resolve('Amul Taaza Milk 1L')).toMatchObject({ confidence: 'high', product: { id: 'amul-taaza-1l' } });
    expect(resolve('Amul Gold 1L').product?.id).toBe('amul-gold-1l');
    expect(resolve('aloo 1kg').product?.id).toBe('potato-1kg');
    expect(resolve('tomatos').product?.id).toMatch(/hybrid-tomato/);
    expect(resolve('xyzzy').confidence).toBe('none');
  });
});

describe('platform adapters', () => {
  it('normalize four different raw formats into the same standardized listing', async () => {
    const adapters = createDemoAdapters(new DemoDataProvider());
    for (const adapter of adapters) {
      const [listing] = await adapter.search('Amul Taaza Toned Milk', DEFAULT_LOCATION);
      expect(listing).toMatchObject({ platform: adapter.id, brand: 'Amul', unit: 'ml', dataSource: 'demo' });
      expect([500, 1000]).toContain(listing.quantity);
      expect(listing.price).toBeGreaterThan(0);
      expect(listing.mrp).toBeGreaterThanOrEqual(listing.price);
      expect(listing.productUrl).toMatch(/^https:\/\//);
      expect(Number.isNaN(Date.parse(listing.lastUpdated))).toBe(false);
    }
  });

  it('demo catalog has at least 50 products and every platform carries most of them', async () => {
    expect(DEMO_CATALOG.length).toBeGreaterThanOrEqual(50);
    const provider = new DemoDataProvider();
    for (const platform of ['blinkit', 'zepto', 'instamart', 'bigbasket'] as const) {
      expect(provider.listings(platform, DEFAULT_LOCATION).length).toBeGreaterThanOrEqual(55);
    }
  });

  it('reports platforms that do not deliver to a location', async () => {
    const [, , instamart] = createDemoAdapters(new DemoDataProvider());
    expect(await instamart.isServiceable({ city: 'Pune', area: 'Kothrud', pincode: '411038' })).toBe(false);
  });
});

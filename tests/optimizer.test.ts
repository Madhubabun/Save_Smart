import { describe, expect, it } from 'vitest';
import type { CatalogProduct, PlatformListing } from '@savesmart/shared';
import { chargesFor } from '@savesmart/optimization-engine';
import { isSamePack, matchProduct } from '@savesmart/product-matching';
import { assignmentOf, fees, item, platforms, run } from './helpers.js';

describe('optimization engine: the 12 required scenarios', () => {
  it('1. one platform is cheapest for everything', () => {
    const items = [item('milk', { blinkit: 60, zepto: 64, instamart: 65 }), item('bread', { blinkit: 40, zepto: 45, instamart: 44 })];
    const plats = platforms({ blinkit: { deliveryFee: 15 }, zepto: { deliveryFee: 15 }, instamart: { deliveryFee: 15 } });
    const r = run(items, plats, 'max_savings');

    expect(r.recommended?.platforms).toEqual(['blinkit']);
    expect(r.recommended?.total).toBe(115);
    expect(r.cheapestSingle?.platform).toBe('blinkit');
    expect(r.savings.amount).toBe(0);
  });

  it('2. two platforms together are cheaper than any single app', () => {
    const items = [item('milk', { blinkit: 50, zepto: 60 }), item('bread', { blinkit: 50, zepto: 40 })];
    const plats = platforms({ blinkit: { handlingFee: 5 }, zepto: { handlingFee: 5 } });
    const r = run(items, plats, 'max_savings');

    expect(r.recommended?.orderCount).toBe(2);
    expect(assignmentOf(r)).toEqual({ milk: 'blinkit', bread: 'zepto' });
    expect(r.recommended?.total).toBe(100);
    expect(r.savings.referenceTotal).toBe(105);
    expect(r.savings.amount).toBe(5);
    expect(r.savings.percent).toBeCloseTo(4.76, 2);
  });

  it('3. a split that looks cheaper on product prices loses once delivery fees are added', () => {
    const items = [item('milk', { blinkit: 50, zepto: 60 }), item('bread', { blinkit: 50, zepto: 40 })];
    const plats = platforms({ blinkit: { deliveryFee: 30 }, zepto: { deliveryFee: 30 } });
    const r = run(items, plats, 'max_savings');

    // Split subtotal is 90 (< 100) but costs 90 + 60 = 150 vs 100 + 30 = 130.
    expect(r.recommended?.orderCount).toBe(1);
    expect(r.recommended?.total).toBe(130);
    expect(r.bestByOrderCount[2].subtotal).toBe(90);
    expect(r.bestByOrderCount[2].total).toBe(150);
    expect(r.explanations.join(' ')).toMatch(/One order wins/);
  });

  it('4. a minimum order value changes the result', () => {
    const items = [item('milk', { blinkit: 50, zepto: 45 }), item('bread', { blinkit: 35, zepto: 50 })];

    const noMinimum = run(items, platforms({ blinkit: {}, zepto: {} }), 'max_savings');
    expect(noMinimum.recommended?.total).toBe(80);
    expect(noMinimum.recommended?.orderCount).toBe(2);

    // Blinkit now needs ₹99: even the whole cart (₹85) can't be ordered there.
    const withMinimum = run(items, platforms({ blinkit: { minOrderValue: 99 }, zepto: {} }), 'max_savings');
    expect(withMinimum.recommended?.platforms).toEqual(['zepto']);
    expect(withMinimum.recommended?.total).toBe(95);
    expect(withMinimum.recommended?.feasible).toBe(true);
    const blinkit = withMinimum.singleOptions.find((s) => s.platform === 'blinkit')!;
    expect(blinkit.belowMinOrder).toBe(true);
    expect(withMinimum.explanations.join(' ')).toMatch(/Blinkit needs a minimum order of ₹99/);
  });

  it('5. an unavailable product is reported, never silently dropped', () => {
    const items = [
      item('milk', { blinkit: 50, zepto: 55 }),
      item('eggs', { blinkit: null, zepto: 90 }),
      item('saffron', { blinkit: null, zepto: null }),
    ];
    const r = run(items, platforms({ blinkit: { deliveryFee: 10 }, zepto: { deliveryFee: 10 } }), 'max_savings');

    const blinkit = r.singleOptions.find((s) => s.platform === 'blinkit')!;
    expect(blinkit.complete).toBe(false);
    expect(blinkit.missingItemIds).toEqual(['eggs']);
    expect(r.cheapestSingle?.platform).toBe('zepto');
    expect(r.unavailableItemIds).toEqual(['saffron']);
    // Eggs must still be bought somewhere.
    expect(assignmentOf(r).eggs).toBe('zepto');
    const text = r.explanations.join(' ');
    expect(text).toMatch(/Blinkit can't supply eggs/);
    expect(text).toMatch(/saffron isn't available on any platform/);
    const eggs = r.itemComparisons.find((c) => c.itemId === 'eggs')!;
    expect(eggs.availableOn).toEqual(['zepto']);
  });

  it('6. different pack sizes must not match', () => {
    const product: CatalogProduct = {
      id: 'amul-taaza-1l', brand: 'Amul', name: 'Taaza Toned Milk', variant: '', size: { value: 1000, unit: 'ml' },
      packCount: 1, category: 'Dairy & Eggs', emoji: '🥛', keywords: ['fresh'], popularity: 90, mrp: 56,
    };
    const listing = (productName: string, quantity: number, price: number): PlatformListing => ({
      productId: productName, platform: 'zepto', productName, brand: 'Amul', variant: '', quantity, unit: 'ml',
      packCount: 1, price, mrp: price, discount: 0, availability: 'in_stock', deliveryFee: 0, platformFee: 0,
      handlingFee: 0, productUrl: '', lastUpdated: '', location: { city: '', area: '', pincode: '' }, dataSource: 'demo',
    });

    const half = listing('Amul Taaza Toned Milk 500 ml', 500, 28);
    const litre = listing('Amul Taaza Toned Fresh Milk 1000 ml', 1000, 56);
    expect(isSamePack(half, litre)).toBe(false);

    // With both packs listed, only the identical 1 L pack is the match.
    const both = matchProduct(product, [half, litre]);
    expect(both?.kind).toBe('exact');
    expect(both?.listing.quantity).toBe(1000);

    // With only 500 ml, it is never treated as the same product: at best an explicit 2 × 500 ml combination.
    const onlyHalf = matchProduct(product, [half]);
    expect(onlyHalf?.kind).toBe('multiple');
    expect(onlyHalf?.multiplier).toBe(2);

    // A bigger pack can't be split, so it does not match at all; neither does another variant.
    expect(matchProduct(product, [listing('Amul Taaza Toned Milk 2 L', 2000, 110)])).toBeNull();
    expect(matchProduct(product, [listing('Amul Gold Full Cream Milk 1 L', 1000, 68)])).toBeNull();
  });

  it('7. quantity greater than one can cross a free-delivery threshold', () => {
    const plats = platforms({ blinkit: { deliveryFee: 20 }, zepto: { deliveryFee: 30, freeDeliveryAbove: 150 } });

    const one = run([item('milk', { blinkit: 60, zepto: 58 }, 1)], plats);
    expect(one.recommended?.platforms).toEqual(['blinkit']);
    expect(one.recommended?.total).toBe(80);

    const three = run([item('milk', { blinkit: 60, zepto: 58 }, 3)], plats);
    expect(three.recommended?.platforms).toEqual(['zepto']);
    expect(three.recommended?.orders[0].lines[0].lineTotal).toBe(174);
    expect(three.recommended?.total).toBe(174);
  });

  it('8. a coupon changes the cheapest platform', () => {
    const items = [item('rice', { blinkit: 210, zepto: 200 })];
    const plats = platforms({
      blinkit: { coupons: [{ code: 'FLAT25', description: '₹25 off above ₹199', type: 'flat', value: 25, minOrder: 199 }] },
      zepto: {},
    });
    const r = run(items, plats);
    expect(r.recommended?.platforms).toEqual(['blinkit']);
    expect(r.recommended?.total).toBe(185);
    expect(r.recommended?.orders[0].coupon?.code).toBe('FLAT25');
    expect(r.recommended?.subtotal).toBe(210);
  });

  const threeWay = () => ({
    items: [
      item('milk', { blinkit: 40, zepto: 70, instamart: 70 }),
      item('rice', { blinkit: 400, zepto: 300, instamart: 400 }),
      item('oil', { blinkit: 200, zepto: 200, instamart: 120 }),
    ],
    plats: platforms({ blinkit: { handlingFee: 5 }, zepto: { handlingFee: 5 }, instamart: { handlingFee: 5 } }),
  });

  it('9. three-platform split', () => {
    const { items, plats } = threeWay();
    const r = run(items, plats, 'max_savings');
    expect(r.recommended?.orderCount).toBe(3);
    expect(assignmentOf(r)).toEqual({ milk: 'blinkit', rice: 'zepto', oil: 'instamart' });
    expect(r.recommended?.total).toBe(475);
  });

  it('10. "minimum number of orders" keeps it to one order', () => {
    const { items, plats } = threeWay();
    const r = run(items, plats, 'min_orders');
    expect(r.recommended?.orderCount).toBe(1);
    expect(r.recommended?.platforms).toEqual(['zepto']);
    expect(r.recommended?.total).toBe(575);
    // The cheaper split is still reported.
    expect(r.cheapestOverall?.total).toBe(475);
  });

  it('11. "maximum savings" splits even for a small saving, "balanced" does not over-split', () => {
    // ₹100 / ₹101 / ₹102: splitting saves ₹3 at the cost of two extra orders.
    const items = [
      item('a', { blinkit: 30, zepto: 31, instamart: 31 }),
      item('b', { blinkit: 36, zepto: 35, instamart: 36 }),
      item('c', { blinkit: 34, zepto: 35, instamart: 33 }),
    ];
    const plats = platforms({ blinkit: {}, zepto: {}, instamart: {} });

    const max = run(items, plats, 'max_savings');
    expect(max.recommended?.orderCount).toBe(3);
    expect(max.recommended?.total).toBe(98);

    const balanced = run(items, plats, 'balanced');
    expect(balanced.recommended?.orderCount).toBe(1);
    expect(balanced.explanations.join(' ')).toMatch(/would save only ₹2 more/);
  });

  it('12. "prefer one platform" picks the cheapest complete single app', () => {
    const items = [item('milk', { blinkit: 50, zepto: 60 }), item('bread', { blinkit: 50, zepto: 40 })];
    const plats = platforms({ blinkit: { handlingFee: 5 }, zepto: { handlingFee: 4 } });
    const r = run(items, plats, 'one_platform');
    expect(r.recommended?.orderCount).toBe(1);
    expect(r.recommended?.platforms).toEqual(['zepto']);
    expect(r.recommended?.total).toBe(104);
    expect(r.cheapestOverall?.orderCount).toBe(2);
  });
});

describe('optimization engine: more behaviour', () => {
  it('balanced mode accepts a split when the saving is meaningful', () => {
    const items = [item('rice', { blinkit: 300, zepto: 420 }), item('oil', { blinkit: 260, zepto: 180 })];
    const r = run(items, platforms({ blinkit: { handlingFee: 4 }, zepto: { handlingFee: 4 } }), 'balanced');
    expect(r.recommended?.orderCount).toBe(2);
    expect(r.savings.amount).toBe(76);
  });

  it('respects a maximum number of orders', () => {
    const items = [
      item('milk', { blinkit: 40, zepto: 70, instamart: 70 }),
      item('rice', { blinkit: 400, zepto: 300, instamart: 400 }),
      item('oil', { blinkit: 200, zepto: 200, instamart: 120 }),
    ];
    const plats = platforms({ blinkit: {}, zepto: {}, instamart: {} });
    const r = run(items, plats, 'max_savings', { maxOrders: 2 });
    expect(r.recommended?.orderCount).toBe(2);
    expect(r.recommended?.total).toBe(490);
  });

  it('membership waives delivery below the normal threshold', () => {
    const items = [item('milk', { zepto: 120, blinkit: 115 })];
    const plats = platforms(
      {
        zepto: { deliveryFee: 30, freeDeliveryAbove: 199, membership: { name: 'Pass', freeDeliveryAbove: 99, waivesSmallCartFee: true } },
        blinkit: { deliveryFee: 30, freeDeliveryAbove: 199 },
      },
      ['zepto'],
    );
    const r = run(items, plats);
    expect(r.recommended?.platforms).toEqual(['zepto']);
    expect(r.recommended?.total).toBe(120);
  });

  it('fees: small-cart, surge and percent coupon with a cap', () => {
    const f = fees({
      deliveryFee: 25, freeDeliveryAbove: 199, smallCartFee: 20, smallCartBelow: 99, platformFee: 2, handlingFee: 4, surgeFee: 10,
      coupons: [{ code: 'TEN', description: '10% off', type: 'percent', value: 10, minOrder: 300, maxDiscount: 40 }],
    });
    expect(chargesFor(f, 80).total).toBe(80 + 25 + 20 + 2 + 4 + 10);
    expect(chargesFor(f, 250).total).toBe(250 + 2 + 4 + 10);
    expect(chargesFor(f, 500).coupon?.amount).toBe(40);
    expect(chargesFor(f, 120).freeDeliveryGap).toBe(79);
  });

  it('local search finds the same answer as exhaustive search', () => {
    const plats = platforms({
      blinkit: { deliveryFee: 25, freeDeliveryAbove: 199, handlingFee: 4 },
      zepto: { deliveryFee: 30, freeDeliveryAbove: 149, platformFee: 3, minOrderValue: 99 },
      instamart: { deliveryFee: 35, freeDeliveryAbove: 249, handlingFee: 5, coupons: [{ code: 'IM50', description: '', type: 'flat', value: 50, minOrder: 499 }] },
      bigbasket: { deliveryFee: 30, freeDeliveryAbove: 200, smallCartFee: 15, smallCartBelow: 100 },
    });
    // Deterministic pseudo-random prices.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const items = Array.from({ length: 8 }, (_, i) =>
      item(`i${i}`, { blinkit: 40 + Math.round(rnd() * 100), zepto: 40 + Math.round(rnd() * 100), instamart: 40 + Math.round(rnd() * 100), bigbasket: 40 + Math.round(rnd() * 100) }),
    );
    const exact = run(items, plats, 'max_savings');
    const heuristic = run(items, plats, 'max_savings', { exhaustiveLimit: 0 });
    expect(exact.stats.strategy).toBe('exhaustive');
    expect(heuristic.stats.strategy).toBe('local-search');
    expect(heuristic.recommended!.total).toBeCloseTo(exact.recommended!.total, 2);
  });

  it('handles a large cart quickly without brute force', () => {
    const plats = platforms({
      blinkit: { deliveryFee: 25, freeDeliveryAbove: 199 },
      zepto: { deliveryFee: 30, freeDeliveryAbove: 149 },
      instamart: { deliveryFee: 35, freeDeliveryAbove: 249 },
      bigbasket: { deliveryFee: 30, freeDeliveryAbove: 200 },
    });
    const items = Array.from({ length: 40 }, (_, i) =>
      item(`i${i}`, { blinkit: 50 + ((i * 7) % 13), zepto: 50 + ((i * 11) % 13), instamart: 50 + ((i * 5) % 13), bigbasket: 50 + ((i * 3) % 13) }),
    );
    const r = run(items, plats, 'max_savings');
    expect(r.stats.strategy).toBe('local-search');
    expect(r.stats.durationMs).toBeLessThan(2000);
    expect(r.recommended!.total).toBeLessThanOrEqual(r.cheapestSingle!.plan!.total);
  });

  it('returns no plan for an empty cart', () => {
    const r = run([], platforms({ blinkit: {} }));
    expect(r.recommended).toBeNull();
  });
});

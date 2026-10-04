import type { FeeSchedule, PlatformId, ShoppingPreference } from '@savesmart/shared';
import { optimizeCart, type EngineItem, type EnginePlatform, type OptimizeInput } from '@savesmart/optimization-engine';

export function fees(overrides: Partial<FeeSchedule> = {}): FeeSchedule {
  return {
    deliveryFee: 0,
    freeDeliveryAbove: null,
    platformFee: 0,
    handlingFee: 0,
    smallCartFee: 0,
    smallCartBelow: 0,
    surgeFee: 0,
    minOrderValue: 0,
    coupons: [],
    ...overrides,
  };
}

/** Item with a price per platform; null means listed but out of stock, missing means not sold there. */
export function item(id: string, prices: Partial<Record<PlatformId, number | null>>, quantity = 1): EngineItem {
  const offers: EngineItem['offers'] = {};
  for (const [platform, price] of Object.entries(prices) as [PlatformId, number | null][]) {
    offers[platform] = price === null ? { unitPrice: 0, unitMrp: 0, available: false } : { unitPrice: price, unitMrp: Math.ceil(price * 1.1), available: true };
  }
  return { id, label: id, quantity, offers };
}

export function platforms(spec: Partial<Record<PlatformId, Partial<FeeSchedule>>>, members: PlatformId[] = []): EnginePlatform[] {
  return (Object.entries(spec) as [PlatformId, Partial<FeeSchedule>][]).map(([id, f]) => ({
    id,
    fees: fees(f),
    isMember: members.includes(id),
  }));
}

export function run(
  items: EngineItem[],
  plats: EnginePlatform[],
  preference: ShoppingPreference = 'max_savings',
  extra: Partial<OptimizeInput> = {},
) {
  return optimizeCart({ items, platforms: plats, preference, ...extra });
}

/** Map of itemId -> platform for the recommended plan. */
export function assignmentOf(result: ReturnType<typeof run>): Record<string, PlatformId> {
  const out: Record<string, PlatformId> = {};
  for (const order of result.recommended?.orders ?? []) for (const line of order.lines) out[line.itemId] = order.platform;
  return out;
}

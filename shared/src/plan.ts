import type { PlatformId, ShoppingPreference } from './types.js';

/** A breakdown of everything charged on one platform order. */
export interface FeeBreakdown {
  delivery: number;
  platform: number;
  handling: number;
  smallCart: number;
  surge: number;
}

export interface OrderLine {
  itemId: string;
  quantity: number;
  unitPrice: number;
  unitMrp: number;
  lineTotal: number;
  lineMrp: number;
}

/** One order on one platform inside a plan. */
export interface PlatformOrder {
  platform: PlatformId;
  lines: OrderLine[];
  /** Sum of selling prices (after product discounts). */
  subtotal: number;
  mrpTotal: number;
  productDiscount: number;
  coupon: { code: string; description: string; amount: number } | null;
  fees: FeeBreakdown;
  feesTotal: number;
  /** Final payable amount for this order. */
  total: number;
  minOrderValue: number;
  meetsMinOrder: boolean;
  /** How much more the user would need to add for free delivery, if relevant. */
  freeDeliveryGap: number | null;
}

/** A complete shopping plan: which items to buy where, and what it all costs. */
export interface Plan {
  orders: PlatformOrder[];
  platforms: PlatformId[];
  orderCount: number;
  subtotal: number;
  mrpTotal: number;
  couponTotal: number;
  feesTotal: number;
  total: number;
  /** False when some order is below its platform's minimum order value. */
  feasible: boolean;
}

export interface SingleCartOption {
  platform: PlatformId;
  /** Plan for the items this platform can supply. */
  plan: Plan | null;
  missingItemIds: string[];
  complete: boolean;
  belowMinOrder: boolean;
}

export interface ItemPlatformPrice {
  platform: PlatformId;
  available: boolean;
  unitPrice: number | null;
  unitMrp: number | null;
  lineTotal: number | null;
}

export interface ItemComparison {
  itemId: string;
  prices: ItemPlatformPrice[];
  cheapest: { platform: PlatformId; unitPrice: number } | null;
  /** Saving on this line when buying at the cheapest instead of the dearest available platform. */
  savingsVsHighest: number;
  availableOn: PlatformId[];
}

export interface Savings {
  /** What the plan is compared with, usually the cheapest single-app cart. */
  referenceTotal: number | null;
  referenceLabel: string;
  amount: number;
  percent: number;
}

export interface OptimizationResult {
  preference: ShoppingPreference;
  recommended: Plan | null;
  cheapestOverall: Plan | null;
  cheapestSingle: SingleCartOption | null;
  simplest: Plan | null;
  singleOptions: SingleCartOption[];
  /** Best plan for each number of orders (1, 2, 3, ...). */
  bestByOrderCount: Record<number, Plan>;
  itemComparisons: ItemComparison[];
  /** Items that no platform can supply right now. They are reported, never silently dropped. */
  unavailableItemIds: string[];
  savings: Savings;
  /** Savings vs. the most expensive complete single-app cart, for context. */
  savingsVsHighestSingle: number;
  explanations: string[];
  stats: { strategy: 'exhaustive' | 'local-search'; evaluatedAssignments: number; durationMs: number };
}

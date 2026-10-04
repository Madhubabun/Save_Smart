import {
  PLATFORMS,
  formatRupees,
  round2,
  type FeeSchedule,
  type ItemComparison,
  type OptimizationResult,
  type OrderLine,
  type Plan,
  type PlatformId,
  type PlatformOrder,
  type SingleCartOption,
  type ShoppingPreference,
} from '@savesmart/shared';
import { chargesFor, orderCost } from './fees.js';

export interface EngineOffer {
  /** Price for one cart unit on this platform (after product discounts). */
  unitPrice: number;
  unitMrp: number;
  available: boolean;
}

export interface EngineItem {
  id: string;
  /** Short display name used in explanations, e.g. "Amul Taaza Milk 1 L". */
  label: string;
  quantity: number;
  offers: Partial<Record<PlatformId, EngineOffer>>;
}

export interface EnginePlatform {
  id: PlatformId;
  fees: FeeSchedule;
  isMember?: boolean;
}

export interface BalancedSettings {
  /** An extra order must save at least this many rupees... */
  minSavingPerExtraOrder: number;
  /** ...or this share of the cart total, whichever is larger. */
  minSavingPercent: number;
}

export interface OptimizeInput {
  items: EngineItem[];
  platforms: EnginePlatform[];
  preference: ShoppingPreference;
  /** Never recommend more orders than this. */
  maxOrders?: number;
  balanced?: BalancedSettings;
  /** Above this many assignments the engine switches from exhaustive search to local search. */
  exhaustiveLimit?: number;
}

export const DEFAULT_BALANCED: BalancedSettings = { minSavingPerExtraOrder: 25, minSavingPercent: 3 };
const DEFAULT_EXHAUSTIVE_LIMIT = 200_000;

interface Candidate {
  total: number;
  /** Platform index chosen for each fulfillable item. */
  assignment: number[];
}

interface SearchState {
  items: EngineItem[];
  platforms: EnginePlatform[];
  /** For each item, the platform indices where it can be bought. */
  options: number[][];
  /** unitPrice × quantity per item per platform index (NaN when unavailable). */
  lineCost: number[][];
}

const popcount = (mask: number): number => {
  let c = 0;
  for (let m = mask; m; m &= m - 1) c++;
  return c;
};

function totalFor(state: SearchState, subtotals: number[]): number {
  let total = 0;
  for (let p = 0; p < subtotals.length; p++) {
    if (subtotals[p] <= 0) continue;
    const plat = state.platforms[p];
    total += orderCost(plat.fees, subtotals[p], !!plat.isMember);
    if (total === Number.POSITIVE_INFINITY) return total;
  }
  return total;
}

function maskOf(assignment: number[]): number {
  let mask = 0;
  for (const p of assignment) mask |= 1 << p;
  return mask;
}

function record(best: Map<number, Candidate>, assignment: number[], total: number): void {
  if (!Number.isFinite(total)) return;
  const mask = maskOf(assignment);
  const current = best.get(mask);
  if (!current || total < current.total - 1e-9) best.set(mask, { total, assignment: [...assignment] });
}

/** Tries every assignment. Used for realistic grocery carts where the space is small. */
function exhaustive(state: SearchState, best: Map<number, Candidate>): number {
  const n = state.items.length;
  const subtotals = new Array(state.platforms.length).fill(0);
  const assignment = new Array<number>(n).fill(-1);
  let evaluated = 0;

  const visit = (i: number): void => {
    if (i === n) {
      evaluated++;
      record(best, assignment, totalFor(state, subtotals));
      return;
    }
    for (const p of state.options[i]) {
      assignment[i] = p;
      subtotals[p] += state.lineCost[i][p];
      visit(i + 1);
      subtotals[p] -= state.lineCost[i][p];
    }
  };
  visit(0);
  return evaluated;
}

/**
 * Local search inside each subset of platforms. Avoids brute force for large carts:
 * starts from several sensible assignments and keeps applying the single best
 * improving move (move one item, or empty one platform entirely) until none helps.
 */
function localSearch(state: SearchState, best: Map<number, Candidate>): number {
  const k = state.platforms.length;
  const n = state.items.length;
  let evaluated = 0;

  for (let subset = 1; subset < 1 << k; subset++) {
    if (!state.options.every((opts) => opts.some((p) => subset & (1 << p)))) continue;
    const allowed = state.options.map((opts) => opts.filter((p) => subset & (1 << p)));

    const starts: number[][] = [];
    starts.push(allowed.map((opts, i) => opts.reduce((a, b) => (state.lineCost[i][b] < state.lineCost[i][a] ? b : a))));
    for (let p = 0; p < k; p++) {
      if (!(subset & (1 << p))) continue;
      starts.push(allowed.map((opts, i) => (opts.includes(p) ? p : starts[0][i])));
    }

    for (const start of starts) {
      const assignment = [...start];
      const subtotals = new Array(k).fill(0);
      assignment.forEach((p, i) => (subtotals[p] += state.lineCost[i][p]));
      let current = totalFor(state, subtotals);
      evaluated++;

      for (let iter = 0; iter < 500; iter++) {
        let bestMove: { apply: () => void; total: number } | null = null;

        for (let i = 0; i < n; i++) {
          const from = assignment[i];
          for (const to of allowed[i]) {
            if (to === from) continue;
            subtotals[from] -= state.lineCost[i][from];
            subtotals[to] += state.lineCost[i][to];
            const t = totalFor(state, subtotals);
            evaluated++;
            subtotals[to] -= state.lineCost[i][to];
            subtotals[from] += state.lineCost[i][from];
            if (t < current - 1e-9 && (!bestMove || t < bestMove.total)) {
              bestMove = {
                total: t,
                apply: () => {
                  subtotals[from] -= state.lineCost[i][from];
                  subtotals[to] += state.lineCost[i][to];
                  assignment[i] = to;
                },
              };
            }
          }
        }

        // Emptying a whole platform can remove fixed fees that single moves never escape.
        for (let p = 0; p < k; p++) {
          if (subtotals[p] <= 0) continue;
          const moved = assignment.map((ap, i) => {
            if (ap !== p) return ap;
            const alts = allowed[i].filter((q) => q !== p);
            if (!alts.length) return -1;
            return alts.reduce((a, b) => (state.lineCost[i][b] < state.lineCost[i][a] ? b : a));
          });
          if (moved.includes(-1)) continue;
          const subs = new Array(k).fill(0);
          moved.forEach((q, i) => (subs[q] += state.lineCost[i][q]));
          const t = totalFor(state, subs);
          evaluated++;
          if (t < current - 1e-9 && (!bestMove || t < bestMove.total)) {
            bestMove = {
              total: t,
              apply: () => {
                moved.forEach((q, i) => (assignment[i] = q));
                subs.forEach((v, q) => (subtotals[q] = v));
              },
            };
          }
        }

        if (!bestMove) break;
        bestMove.apply();
        current = bestMove.total;
      }
      record(best, assignment, current);
    }
  }
  return evaluated;
}

function buildOrder(state: SearchState, p: number, itemIdx: number[]): PlatformOrder {
  const plat = state.platforms[p];
  const lines: OrderLine[] = itemIdx.map((i) => {
    const item = state.items[i];
    const offer = item.offers[plat.id]!;
    return {
      itemId: item.id,
      quantity: item.quantity,
      unitPrice: offer.unitPrice,
      unitMrp: offer.unitMrp,
      lineTotal: round2(offer.unitPrice * item.quantity),
      lineMrp: round2(offer.unitMrp * item.quantity),
    };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const mrpTotal = round2(lines.reduce((s, l) => s + l.lineMrp, 0));
  const charges = chargesFor(plat.fees, subtotal, !!plat.isMember);
  return {
    platform: plat.id,
    lines,
    subtotal,
    mrpTotal,
    productDiscount: round2(mrpTotal - subtotal),
    coupon: charges.coupon,
    fees: charges.fees,
    feesTotal: charges.feesTotal,
    total: charges.total,
    minOrderValue: plat.fees.minOrderValue,
    meetsMinOrder: charges.meetsMinOrder,
    freeDeliveryGap: charges.freeDeliveryGap,
  };
}

function buildPlan(state: SearchState, assignment: number[], itemIndices?: number[]): Plan {
  const indices = itemIndices ?? assignment.map((_, i) => i);
  const byPlatform = new Map<number, number[]>();
  indices.forEach((itemIndex, pos) => {
    const p = assignment[pos];
    if (!byPlatform.has(p)) byPlatform.set(p, []);
    byPlatform.get(p)!.push(itemIndex);
  });
  const orders = [...byPlatform.entries()]
    .map(([p, idx]) => buildOrder(state, p, idx))
    .sort((a, b) => b.total - a.total);
  return {
    orders,
    platforms: orders.map((o) => o.platform),
    orderCount: orders.length,
    subtotal: round2(orders.reduce((s, o) => s + o.subtotal, 0)),
    mrpTotal: round2(orders.reduce((s, o) => s + o.mrpTotal, 0)),
    couponTotal: round2(orders.reduce((s, o) => s + (o.coupon?.amount ?? 0), 0)),
    feesTotal: round2(orders.reduce((s, o) => s + o.feesTotal, 0)),
    total: round2(orders.reduce((s, o) => s + o.total, 0)),
    feasible: orders.every((o) => o.meetsMinOrder),
  };
}

const name = (id: PlatformId): string => PLATFORMS[id].shortName;
const joinNames = (ids: PlatformId[]): string =>
  ids.length <= 1 ? ids.map(name).join('') : `${ids.slice(0, -1).map(name).join(', ')} and ${name(ids[ids.length - 1])}`;

/**
 * The SaveSmart optimization engine.
 *
 * Objective: the minimum FINAL payable amount (products + fees - coupons), not the
 * minimum product subtotal. Fees depend on each order's subtotal (free-delivery
 * thresholds, small-cart fees, coupons, minimum order values), so the engine
 * searches over assignments of items to platforms and prices every order with
 * the platform's full fee schedule.
 */
export function optimizeCart(input: OptimizeInput): OptimizationResult {
  const started = Date.now();
  const platforms = input.platforms;
  const k = platforms.length;
  if (k > 16) throw new Error('At most 16 platforms are supported.');

  const fulfillable: EngineItem[] = [];
  const unavailableItemIds: string[] = [];
  for (const item of input.items) {
    const anyAvailable = platforms.some((p) => item.offers[p.id]?.available);
    if (anyAvailable && item.quantity > 0) fulfillable.push(item);
    else unavailableItemIds.push(item.id);
  }

  const state: SearchState = {
    items: fulfillable,
    platforms,
    options: fulfillable.map((item) => platforms.flatMap((p, idx) => (item.offers[p.id]?.available ? [idx] : []))),
    lineCost: fulfillable.map((item) =>
      platforms.map((p) => {
        const o = item.offers[p.id];
        return o?.available ? round2(o.unitPrice * item.quantity) : Number.NaN;
      }),
    ),
  };

  // 1. Search: best plan for every set of platforms actually used.
  const bestByMask = new Map<number, Candidate>();
  const space = state.options.reduce((acc, o) => acc * o.length, 1);
  const exhaustiveLimit = input.exhaustiveLimit ?? DEFAULT_EXHAUSTIVE_LIMIT;
  const strategy = space <= exhaustiveLimit ? 'exhaustive' : 'local-search';
  const evaluatedAssignments = fulfillable.length === 0 ? 0 : strategy === 'exhaustive' ? exhaustive(state, bestByMask) : localSearch(state, bestByMask);

  const maxOrders = Math.max(1, Math.min(input.maxOrders ?? k, k));
  const plans = [...bestByMask.entries()]
    .filter(([mask]) => popcount(mask) <= maxOrders)
    .map(([, c]) => buildPlan(state, c.assignment));

  // 2. Single-platform carts, including incomplete ones (so missing items can be explained).
  const singleOptions: SingleCartOption[] = platforms.map((plat, p) => {
    const idx = fulfillable.flatMap((item, i) => (item.offers[plat.id]?.available ? [i] : []));
    const missingItemIds = fulfillable.filter((_, i) => !idx.includes(i)).map((it) => it.id);
    const plan = idx.length ? buildPlan(state, idx.map(() => p), idx) : null;
    return {
      platform: plat.id,
      plan,
      missingItemIds,
      complete: missingItemIds.length === 0 && fulfillable.length > 0,
      belowMinOrder: plan ? !plan.feasible : false,
    };
  });

  const byTotal = (a: Plan, b: Plan) => a.total - b.total || a.orderCount - b.orderCount;
  const cheapestOverall = [...plans].sort(byTotal)[0] ?? null;
  const simplest = [...plans].sort((a, b) => a.orderCount - b.orderCount || a.total - b.total)[0] ?? null;
  const completeSingles = singleOptions.filter((s) => s.complete && s.plan && s.plan.feasible);
  const cheapestSingle = [...completeSingles].sort((a, b) => a.plan!.total - b.plan!.total)[0] ?? null;
  const highestSingle = [...completeSingles].sort((a, b) => b.plan!.total - a.plan!.total)[0] ?? null;

  const bestByOrderCount: Record<number, Plan> = {};
  for (const plan of plans) {
    const cur = bestByOrderCount[plan.orderCount];
    if (!cur || plan.total < cur.total) bestByOrderCount[plan.orderCount] = plan;
  }

  // 3. Respect the user's preference.
  const explanations: string[] = [];
  let recommended: Plan | null = null;
  const balanced = input.balanced ?? DEFAULT_BALANCED;
  switch (input.preference) {
    case 'max_savings':
      recommended = cheapestOverall;
      break;
    case 'min_orders':
      recommended = simplest;
      break;
    case 'one_platform':
      recommended = cheapestSingle?.plan ?? simplest;
      if (!cheapestSingle && simplest) {
        explanations.push(`No single app has your whole cart right now, so this uses the fewest orders possible (${simplest.orderCount}).`);
      }
      break;
    case 'balanced': {
      const reference = cheapestOverall?.total ?? 0;
      const penalty = Math.max(balanced.minSavingPerExtraOrder, (reference * balanced.minSavingPercent) / 100);
      recommended = [...plans].sort((a, b) => a.total + penalty * a.orderCount - (b.total + penalty * b.orderCount) || byTotal(a, b))[0] ?? null;
      if (recommended && cheapestOverall && cheapestOverall.orderCount > recommended.orderCount) {
        const extra = round2(recommended.total - cheapestOverall.total);
        if (extra > 0) {
          explanations.push(
            `A ${cheapestOverall.orderCount}-order split would save only ${formatRupees(extra)} more, so SaveSmart kept it to ${recommended.orderCount} ${recommended.orderCount === 1 ? 'order' : 'orders'}.`,
          );
        }
      }
      break;
    }
  }

  // 4. Savings against the cheapest way to buy everything from one app.
  const referenceTotal = cheapestSingle?.plan?.total ?? null;
  const amount = recommended && referenceTotal !== null ? Math.max(0, round2(referenceTotal - recommended.total)) : 0;
  const savings = {
    referenceTotal,
    referenceLabel: cheapestSingle ? `Cheapest single app (${name(cheapestSingle.platform)})` : 'No single app has your whole cart',
    amount,
    percent: referenceTotal ? round2((amount / referenceTotal) * 100) : 0,
  };

  // 5. Per-item comparison.
  const itemComparisons: ItemComparison[] = input.items.map((item) => {
    const prices = platforms.map((p) => {
      const o = item.offers[p.id];
      const available = !!o?.available;
      return {
        platform: p.id,
        available,
        unitPrice: available ? o!.unitPrice : null,
        unitMrp: o ? o.unitMrp : null,
        lineTotal: available ? round2(o!.unitPrice * item.quantity) : null,
      };
    });
    const avail = prices.filter((p) => p.available);
    const min = avail.reduce<(typeof avail)[number] | null>((a, b) => (!a || b.unitPrice! < a.unitPrice! ? b : a), null);
    const max = avail.reduce<(typeof avail)[number] | null>((a, b) => (!a || b.unitPrice! > a.unitPrice! ? b : a), null);
    return {
      itemId: item.id,
      prices,
      cheapest: min ? { platform: min.platform, unitPrice: min.unitPrice! } : null,
      savingsVsHighest: min && max ? round2((max.unitPrice! - min.unitPrice!) * item.quantity) : 0,
      availableOn: avail.map((p) => p.platform),
    };
  });

  // 6. Plain-language explanations.
  const labelOf = new Map(input.items.map((i) => [i.id, i.label]));
  if (recommended && recommended.orderCount > 1 && cheapestSingle && amount > 0) {
    const extraFees = round2(recommended.feesTotal - cheapestSingle.plan!.feesTotal);
    explanations.unshift(
      `Splitting between ${joinNames(recommended.platforms)} costs ${formatRupees(amount)} less than buying everything on ${name(cheapestSingle.platform)}` +
        (extraFees > 0 ? `, even after ${formatRupees(extraFees)} in extra fees.` : '.'),
    );
  } else if (recommended && recommended.orderCount === 1 && bestByOrderCount[2]) {
    const split = bestByOrderCount[2];
    if (split.subtotal < recommended.subtotal && split.total >= recommended.total) {
      explanations.push(
        `Splitting would lower product prices by ${formatRupees(round2(recommended.subtotal - split.subtotal))}, but extra delivery and handling fees make it ${formatRupees(round2(split.total - recommended.total))} more expensive. One order wins.`,
      );
    }
  }
  for (const single of singleOptions) {
    if (single.missingItemIds.length && single.plan) {
      const names = single.missingItemIds.map((id) => labelOf.get(id) ?? id);
      explanations.push(
        `${name(single.platform)} can't supply ${names.join(', ')}, so it can't complete your cart on its own.`,
      );
    }
  }
  for (const single of singleOptions) {
    if (single.belowMinOrder && single.plan) {
      const plat = platforms.find((p) => p.id === single.platform)!;
      explanations.push(`${name(single.platform)} needs a minimum order of ${formatRupees(plat.fees.minOrderValue)}.`);
    }
  }
  if (recommended) {
    for (const order of recommended.orders) {
      if (order.coupon) explanations.push(`Coupon ${order.coupon.code} saves ${formatRupees(order.coupon.amount)} on ${name(order.platform)}.`);
    }
  }
  for (const id of unavailableItemIds) {
    explanations.push(`${labelOf.get(id) ?? id} isn't available on any platform right now, so totals don't include it.`);
  }

  return {
    preference: input.preference,
    recommended,
    cheapestOverall,
    cheapestSingle,
    simplest,
    singleOptions,
    bestByOrderCount,
    itemComparisons,
    unavailableItemIds,
    savings,
    savingsVsHighestSingle: recommended && highestSingle ? Math.max(0, round2(highestSingle.plan!.total - recommended.total)) : 0,
    explanations,
    stats: { strategy, evaluatedAssignments, durationMs: Date.now() - started },
  };
}

import { round2, type Coupon, type FeeBreakdown, type FeeSchedule } from '@savesmart/shared';

export interface OrderCharges {
  fees: FeeBreakdown;
  feesTotal: number;
  coupon: { code: string; description: string; amount: number } | null;
  total: number;
  meetsMinOrder: boolean;
  freeDeliveryGap: number | null;
}

/** Discount a coupon gives on a subtotal, or 0 when it does not apply. */
export function couponValue(coupon: Coupon, subtotal: number, isMember: boolean): number {
  if (subtotal < coupon.minOrder) return 0;
  if (coupon.membersOnly && !isMember) return 0;
  const raw = coupon.type === 'flat' ? coupon.value : Math.floor((subtotal * coupon.value) / 100);
  const capped = coupon.maxDiscount !== undefined ? Math.min(raw, coupon.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, subtotal));
}

/** Best single coupon for this subtotal (platforms allow one coupon per order). */
export function bestCoupon(fees: FeeSchedule, subtotal: number, isMember: boolean): { coupon: Coupon; amount: number } | null {
  let best: { coupon: Coupon; amount: number } | null = null;
  for (const coupon of fees.coupons) {
    const amount = couponValue(coupon, subtotal, isMember);
    if (amount > 0 && (!best || amount > best.amount)) best = { coupon, amount };
  }
  return best;
}

/**
 * Final payable amount for one order on one platform, given the product subtotal
 * (selling prices after product discounts). This is the function the optimizer minimizes.
 */
export function chargesFor(fees: FeeSchedule, subtotal: number, isMember = false): OrderCharges {
  const membership = isMember ? fees.membership : undefined;
  const freeAbove = membership ? membership.freeDeliveryAbove : fees.freeDeliveryAbove;
  const delivery = freeAbove !== null && subtotal >= freeAbove ? 0 : fees.deliveryFee;
  const smallCart = subtotal < fees.smallCartBelow && !membership?.waivesSmallCartFee ? fees.smallCartFee : 0;

  const breakdown: FeeBreakdown = {
    delivery,
    platform: fees.platformFee,
    handling: fees.handlingFee,
    smallCart,
    surge: fees.surgeFee,
  };
  const feesTotal = round2(delivery + fees.platformFee + fees.handlingFee + smallCart + fees.surgeFee);
  const best = bestCoupon(fees, subtotal, isMember);
  const couponAmount = best?.amount ?? 0;

  return {
    fees: breakdown,
    feesTotal,
    coupon: best ? { code: best.coupon.code, description: best.coupon.description, amount: best.amount } : null,
    total: round2(subtotal - couponAmount + feesTotal),
    meetsMinOrder: subtotal >= fees.minOrderValue,
    freeDeliveryGap: delivery > 0 && freeAbove !== null ? round2(freeAbove - subtotal) : null,
  };
}

/** Cost used during search: Infinity when the order cannot be placed, 0 when the platform is unused. */
export function orderCost(fees: FeeSchedule, subtotal: number, isMember: boolean): number {
  if (subtotal <= 0) return 0;
  if (subtotal < fees.minOrderValue) return Number.POSITIVE_INFINITY;
  return chargesFor(fees, subtotal, isMember).total;
}

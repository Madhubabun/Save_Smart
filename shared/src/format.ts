import type { BaseUnit, Size } from './types.js';

/** Round to paise so floating point noise never reaches a price. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** ₹1,240 or ₹62.50 */
export function formatRupees(n: number): string {
  const rounded = round2(n);
  const text = Number.isInteger(rounded) ? inr.format(rounded) : rounded.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `₹${text}`;
}

/** Human label for a normalized size: 1000 ml -> "1 L", 500 g -> "500 g". */
export function formatSize(size: Size, packCount = 1): string {
  const base = formatBase(size.value, size.unit);
  return packCount > 1 ? `${packCount} × ${base}` : base;
}

function formatBase(value: number, unit: BaseUnit): string {
  if (unit === 'ml') return value >= 1000 ? `${trim(value / 1000)} L` : `${trim(value)} ml`;
  if (unit === 'g') return value >= 1000 ? `${trim(value / 1000)} kg` : `${trim(value)} g`;
  return `${trim(value)} pcs`;
}

function trim(n: number): string {
  return String(round2(n));
}

/** "₹6.40 / 100 ml", the price normalized per standard measure. */
export function unitPriceLabel(price: number, size: Size, packCount = 1): string {
  const total = size.value * packCount;
  if (size.unit === 'pcs') return `₹${(price / total).toFixed(2)} / pc`;
  const per = total >= 1000 ? 1000 : 100;
  const label = size.unit === 'ml' ? (per === 1000 ? 'L' : '100 ml') : per === 1000 ? 'kg' : '100 g';
  return `₹${((price / total) * per).toFixed(2)} / ${label}`;
}

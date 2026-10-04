import type { BaseUnit, Size } from '@savesmart/shared';

const UNIT_MAP: Record<string, { unit: BaseUnit; factor: number }> = {
  kg: { unit: 'g', factor: 1000 },
  kgs: { unit: 'g', factor: 1000 },
  kilo: { unit: 'g', factor: 1000 },
  g: { unit: 'g', factor: 1 },
  gm: { unit: 'g', factor: 1 },
  gms: { unit: 'g', factor: 1 },
  gram: { unit: 'g', factor: 1 },
  grams: { unit: 'g', factor: 1 },
  l: { unit: 'ml', factor: 1000 },
  lt: { unit: 'ml', factor: 1000 },
  ltr: { unit: 'ml', factor: 1000 },
  ltrs: { unit: 'ml', factor: 1000 },
  litre: { unit: 'ml', factor: 1000 },
  litres: { unit: 'ml', factor: 1000 },
  liter: { unit: 'ml', factor: 1000 },
  liters: { unit: 'ml', factor: 1000 },
  ml: { unit: 'ml', factor: 1 },
  pc: { unit: 'pcs', factor: 1 },
  pcs: { unit: 'pcs', factor: 1 },
  piece: { unit: 'pcs', factor: 1 },
  pieces: { unit: 'pcs', factor: 1 },
  n: { unit: 'pcs', factor: 1 },
  nos: { unit: 'pcs', factor: 1 },
  unit: { unit: 'pcs', factor: 1 },
  units: { unit: 'pcs', factor: 1 },
  dozen: { unit: 'pcs', factor: 12 },
};

const UNIT_ALT = Object.keys(UNIT_MAP)
  .sort((a, b) => b.length - a.length)
  .join('|');

const NUM = '(\\d+(?:\\.\\d+)?)';
/** "6 x 100 g", "2×500ml" */
const MULTIPACK_RE = new RegExp(`${NUM}\\s*[x×]\\s*${NUM}\\s*(${UNIT_ALT})(?![a-z])`, 'i');
/** "1 L", "500ml", "1.5 kg", "12 pcs", "1 dozen" */
const SIZE_RE = new RegExp(`${NUM}\\s*(${UNIT_ALT})(?![a-z])`, 'i');
const HALF_DOZEN_RE = /half\s+(a\s+)?dozen/i;
const PACK_OF_RE = /pack\s+of\s+(\d+)/i;

export interface ParsedSize {
  size: Size;
  packCount: number;
  /** The exact text that was recognized, so callers can strip it. */
  match: string;
}

export function toBase(value: number, unitText: string): Size | null {
  const u = UNIT_MAP[unitText.toLowerCase()];
  if (!u) return null;
  return { value: Math.round(value * u.factor * 1000) / 1000, unit: u.unit };
}

/**
 * Finds a pack size inside free text and normalizes it to base units.
 * "Amul Taaza Toned Milk 1 L" -> 1000 ml; "Lux Soap 4 x 100 g" -> 100 g × 4.
 */
export function parseSize(text: string): ParsedSize | null {
  const multi = MULTIPACK_RE.exec(text);
  if (multi) {
    const size = toBase(parseFloat(multi[2]), multi[3]);
    if (size) return { size, packCount: parseInt(multi[1], 10), match: multi[0] };
  }
  if (HALF_DOZEN_RE.test(text)) {
    const m = HALF_DOZEN_RE.exec(text)!;
    return { size: { value: 6, unit: 'pcs' }, packCount: 1, match: m[0] };
  }
  const single = SIZE_RE.exec(text);
  if (single) {
    const size = toBase(parseFloat(single[1]), single[2]);
    if (size) return { size, packCount: 1, match: single[0] };
  }
  const packOf = PACK_OF_RE.exec(text);
  if (packOf) {
    return { size: { value: parseInt(packOf[1], 10), unit: 'pcs' }, packCount: 1, match: packOf[0] };
  }
  return null;
}

/** Sizes are equal when the unit matches and values differ by less than 0.5%. */
export function sameSize(a: Size, b: Size): boolean {
  if (a.unit !== b.unit) return false;
  return Math.abs(a.value - b.value) <= Math.max(a.value, b.value) * 0.005;
}

/** Total measure of a pack, e.g. 4 × 100 g = 400 g. */
export function totalMeasure(size: Size, packCount = 1): Size {
  return { value: size.value * packCount, unit: size.unit };
}

/**
 * How many `smaller` packs make up exactly one `larger` pack, or null if they
 * cannot be combined exactly (different units, or not a whole multiple).
 */
export function packMultiple(target: Size, pack: Size): number | null {
  if (target.unit !== pack.unit || pack.value <= 0) return null;
  const ratio = target.value / pack.value;
  const rounded = Math.round(ratio);
  if (rounded < 1 || Math.abs(ratio - rounded) > 0.001) return null;
  return rounded;
}

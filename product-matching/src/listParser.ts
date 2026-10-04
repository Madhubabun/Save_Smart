import type { Size } from '@savesmart/shared';
import { parseSize, toBase } from './units.js';

export interface ParsedLine {
  raw: string;
  /** Product words with quantity and size removed, e.g. "Amul Taaza Milk". */
  name: string;
  /** How many packs. Defaults to 1. */
  quantity: number;
  /** Requested pack size, if the user wrote one ("1kg", "500 ml", "1 dozen"). */
  size: Size | null;
  packCount: number;
  /**
   * True when the line ended with a bare number and no unit ("Eggs 12").
   * The resolver decides whether that means 12 packs or a 12-piece pack.
   */
  bareNumber: boolean;
}

const BULLET_RE = /^\s*(?:[-*•·]+|\d+[.)])\s+/;
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

/** Splits a pasted list into items: one per line, and commas or semicolons also separate items. */
export function splitList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[;,](?![^()]*\))/))
    .map((l) => l.replace(BULLET_RE, '').trim())
    .filter((l) => l.length > 0 && /[a-zA-Zऀ-ॿ]/.test(l));
}

/**
 * Parses one shopping-list line.
 * "Milk 2" -> Milk ×2; "Tomatoes 1kg" -> Tomatoes, 1 kg ×1; "2 x Amul Taaza 1L" -> Amul Taaza, 1 L ×2.
 */
export function parseLine(raw: string): ParsedLine {
  let text = ` ${raw.trim()} `;
  let quantity: number | null = null;
  let bareNumber = false;

  // Explicit multipliers first: "x2", "× 3", "* 2", "qty 2"
  const mult = /(?:\s[x×*]\s*(\d+)|\bqty\.?\s*(\d+))\s*$/i.exec(text);
  if (mult) {
    quantity = parseInt(mult[1] ?? mult[2], 10);
    text = text.slice(0, mult.index) + ' ';
  }
  const leadingMult = /^\s*(\d+)\s*[x×*]\s+/i.exec(text);
  if (leadingMult && quantity === null) {
    quantity = parseInt(leadingMult[1], 10);
    text = ' ' + text.slice(leadingMult[0].length);
  }

  let size: Size | null = null;
  let packCount = 1;
  const parsedSize = parseSize(text);
  if (parsedSize) {
    size = parsedSize.size;
    packCount = parsedSize.packCount;
    text = text.replace(parsedSize.match, ' ');
  }

  if (quantity === null) {
    const trailing = /\s(\d+)\s*$/.exec(text);
    const leading = /^\s*(\d+)\s+(?=[a-zA-Z])/.exec(text);
    if (trailing) {
      quantity = parseInt(trailing[1], 10);
      text = text.slice(0, trailing.index);
      bareNumber = size === null;
    } else if (leading) {
      quantity = parseInt(leading[1], 10);
      text = text.slice(leading[0].length);
      bareNumber = size === null;
    } else {
      const word = new RegExp(`^\\s*(${Object.keys(WORD_NUMBERS).join('|')})\\s+`, 'i').exec(text);
      if (word) {
        quantity = WORD_NUMBERS[word[1].toLowerCase()];
        text = text.slice(word[0].length);
      }
    }
  }

  const name = text.replace(/[()[\]-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    raw: raw.trim(),
    name,
    quantity: Math.min(Math.max(quantity ?? 1, 1), 99),
    size,
    packCount,
    bareNumber,
  };
}

export function parseShoppingList(text: string): ParsedLine[] {
  return splitList(text).map(parseLine).filter((l) => l.name.length > 0);
}

/** Converts a manual-entry unit string ("kg", "L", "pcs") and amount to a size. */
export function sizeFromManual(amount: number, unit: string | undefined): Size | null {
  if (!unit) return null;
  return toBase(amount, unit.trim());
}

const STOPWORDS = new Set([
  'the', 'and', 'of', 'with', 'for', 'pack', 'pouch', 'packet', 'pkt', 'box', 'bottle', 'jar', 'tetra',
  'carton', 'combo', 'a', 'an', 'in', 'by', 'new', 'buy', 'get', 'free', 'x',
  // unit words: sizes are compared separately, after normalization
  'pc', 'pcs', 'piece', 'pieces', 'ml', 'l', 'lt', 'ltr', 'litre', 'liter', 'g', 'gm', 'gms', 'gram', 'grams',
  'kg', 'kgs', 'unit', 'units', 'dozen', 'n', 'nos',
]);

/** Very small stemmer: tomatoes -> tomato, biscuits -> biscuit, berries -> berry. */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('ches') || word.endsWith('shes') || word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

/** Lowercases, strips punctuation and stopwords, and stems. Numbers are dropped (sizes are handled separately). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9ऀ-ॿ\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t) && !/^\d+(\.\d+)?[a-z]*$/.test(t))
    .map(stem);
}

/** Levenshtein distance capped at 2, enough for typo tolerance ("biscut", "tomatos"). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/** True when a query token matches a product token exactly, by prefix, or with one typo. */
export function tokenMatches(queryToken: string, productToken: string): boolean {
  if (queryToken === productToken) return true;
  if (queryToken.length >= 3 && productToken.startsWith(queryToken)) return true;
  if (queryToken.length >= 5 && productToken.length >= 5 && withinOneEdit(queryToken, productToken)) return true;
  return false;
}

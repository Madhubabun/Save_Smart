import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CatalogProduct, ComparisonResponse, MatchConfidence, PlatformId, ResolvedCartItem, UserPreferences } from '@savesmart/shared';
import { api } from '../lib/api';
import { storage } from '../lib/storage';

export interface CartLine {
  id: string;
  product: CatalogProduct;
  quantity: number;
  query: string;
  confidence: MatchConfidence;
  alternatives: CatalogProduct[];
  note?: string;
}

export type ThemeChoice = 'light' | 'dark' | 'system';

const DEFAULT_PREFS: UserPreferences = {
  preference: 'balanced',
  location: { city: 'Bengaluru', area: 'Whitefield', pincode: '560066' },
  memberships: [],
};

export const DEMO_LIST = 'Milk 2\nBread 1\nEggs 12\nTomatoes 1kg\nRice 5kg\nBiscuits 2';

interface AppState {
  cart: CartLine[];
  addResolved: (items: ResolvedCartItem[]) => { added: number; unmatched: string[] };
  addProduct: (product: CatalogProduct, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  chooseProduct: (id: string, product: CatalogProduct) => void;
  removeLine: (id: string) => void;
  clearCart: () => void;
  replaceCart: (lines: CartLine[]) => void;
  savedCartId: string | null;
  setSavedCartId: (id: string | null) => void;

  prefs: UserPreferences;
  updatePrefs: (patch: Partial<UserPreferences>) => void;
  simulateFailures: PlatformId[];
  setSimulateFailures: (p: PlatformId[]) => void;

  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;

  comparisons: Record<string, ComparisonResponse>;
  rememberComparison: (c: ComparisonResponse) => void;
}

const Ctx = createContext<AppState | null>(null);

let lineSeq = 0;
const newId = () => `l${Date.now().toString(36)}${(lineSeq++).toString(36)}`;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>(() => storage.getJSON<CartLine[]>('ss.cart', []));
  const [savedCartId, setSavedCartId] = useState<string | null>(() => storage.get('ss.savedCartId'));
  const [prefs, setPrefs] = useState<UserPreferences>(() => ({ ...DEFAULT_PREFS, ...storage.getJSON<Partial<UserPreferences>>('ss.prefs', {}) }));
  const [simulateFailures, setSimulateFailures] = useState<PlatformId[]>([]);
  const [theme, setThemeState] = useState<ThemeChoice>(() => (storage.get('ss.theme') as ThemeChoice) || 'system');
  const [comparisons, setComparisons] = useState<Record<string, ComparisonResponse>>({});
  const prefsLoaded = useRef(false);

  useEffect(() => storage.setJSON('ss.cart', cart), [cart]);
  useEffect(() => (savedCartId ? storage.set('ss.savedCartId', savedCartId) : storage.remove('ss.savedCartId')), [savedCartId]);

  // Preferences live on the server (per user) with a local copy for instant startup.
  useEffect(() => {
    api
      .preferences()
      .then((p) => {
        prefsLoaded.current = true;
        const local = storage.getJSON<Partial<UserPreferences> | null>('ss.prefs', null);
        if (local) {
          // This device has preferences the server may not (e.g. demo server restarted): push them.
          const merged = { ...DEFAULT_PREFS, ...local };
          setPrefs(merged);
          api.savePreferences(merged).catch(() => {});
        } else setPrefs(p);
      })
      .catch(() => {});
  }, []);

  const updatePrefs = useCallback((patch: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      storage.setJSON('ss.prefs', next);
      api.savePreferences(next).catch(() => {});
      return next;
    });
  }, []);

  // Theme: remembered per device, applied to <html>.
  useEffect(() => {
    storage.set('ss.theme', theme);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches));
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const addResolved = useCallback((items: ResolvedCartItem[]) => {
    const unmatched: string[] = [];
    const lines: CartLine[] = [];
    for (const it of items) {
      if (!it.product) {
        unmatched.push(it.query);
        continue;
      }
      lines.push({
        id: newId(),
        product: it.product,
        quantity: it.quantity,
        query: it.query,
        confidence: it.confidence,
        alternatives: it.alternatives,
        note: it.note,
      });
    }
    setCart((prev) => mergeLines(prev, lines));
    return { added: lines.length, unmatched };
  }, []);

  const addProduct = useCallback((product: CatalogProduct, quantity = 1) => {
    setCart((prev) => mergeLines(prev, [{ id: newId(), product, quantity, query: product.name, confidence: 'high', alternatives: [] }]));
  }, []);

  const value = useMemo<AppState>(
    () => ({
      cart,
      addResolved,
      addProduct,
      setQuantity: (id, quantity) =>
        setCart((prev) => (quantity <= 0 ? prev.filter((l) => l.id !== id) : prev.map((l) => (l.id === id ? { ...l, quantity: Math.min(quantity, 99) } : l)))),
      chooseProduct: (id, product) =>
        setCart((prev) =>
          prev.map((l) =>
            l.id === id
              ? { ...l, product, confidence: 'high', alternatives: [l.product, ...l.alternatives.filter((a) => a.id !== product.id)].slice(0, 5) }
              : l,
          ),
        ),
      removeLine: (id) => setCart((prev) => prev.filter((l) => l.id !== id)),
      clearCart: () => {
        setCart([]);
        setSavedCartId(null);
      },
      replaceCart: (lines) => setCart(lines),
      savedCartId,
      setSavedCartId,
      prefs,
      updatePrefs,
      simulateFailures,
      setSimulateFailures,
      theme,
      setTheme: setThemeState,
      comparisons,
      rememberComparison: (c) => setComparisons((prev) => ({ ...prev, [c.id]: c })),
    }),
    [cart, addResolved, addProduct, savedCartId, prefs, updatePrefs, simulateFailures, theme, comparisons],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Adding a product that is already in the cart increases its quantity instead of duplicating it. */
function mergeLines(prev: CartLine[], incoming: CartLine[]): CartLine[] {
  const next = [...prev];
  for (const line of incoming) {
    const i = next.findIndex((l) => l.product.id === line.product.id);
    if (i >= 0) next[i] = { ...next[i], quantity: Math.min(99, next[i].quantity + line.quantity) };
    else next.push(line);
  }
  return next;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider');
  return ctx;
}

export function cartFromSaved(items: { productId: string; quantity: number; product?: CatalogProduct }[]): CartLine[] {
  return items
    .filter((i) => i.product)
    .map((i) => ({ id: newId(), product: i.product!, quantity: i.quantity, query: i.product!.name, confidence: 'high' as const, alternatives: [] }));
}

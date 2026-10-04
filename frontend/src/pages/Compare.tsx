import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PLATFORMS, PLATFORM_IDS, type CatalogProduct } from '@savesmart/shared';
import { useCompareRunner } from '../components/CompareRunner';
import { LocationChip } from '../components/LocationPicker';
import { PreferencePicker } from '../components/PreferencePicker';
import { Badge, Button, Card, EmptyState, Notice, PlatformDot, SectionTitle, Sheet, Stepper, cx } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { productLabel, productSize } from '../lib/format';
import { DEMO_LIST, useApp, type CartLine } from '../state/AppState';

type Tab = 'search' | 'paste' | 'manual';

export function Compare() {
  const app = useApp();
  const { run, running } = useCompareRunner();
  const [tab, setTab] = useState<Tab>(app.cart.length ? 'search' : 'paste');
  const [message, setMessage] = useState<{ level: 'info' | 'warning'; title: string; message: string } | null>(null);
  const needsConfirm = app.cart.filter((l) => l.confidence === 'low').length;

  return (
    <div className={cx('mx-auto max-w-2xl space-y-6', app.cart.length > 0 && 'pb-28 md:pb-0')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">My Cart</h1>
        <LocationChip />
      </div>

      <Card className="p-4">
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1" role="tablist" aria-label="Add items">
          {(
            [
              ['search', 'Search'],
              ['paste', 'Paste list'],
              ['manual', 'Manual'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cx('min-h-10 rounded-xl text-sm font-semibold transition', tab === t ? 'bg-surface shadow-sm' : 'text-muted')}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'search' && <SearchAdd />}
        {tab === 'paste' && <PasteAdd onResult={setMessage} />}
        {tab === 'manual' && <ManualAdd onResult={setMessage} />}
        <p className="mt-3 text-xs text-muted">Coming soon: voice lists, photo of a handwritten list, barcode scanning.</p>
      </Card>

      {message && <Notice notice={message} onClose={() => setMessage(null)} />}

      <section>
        <SectionTitle
          action={
            app.cart.length > 0 && (
              <div className="flex gap-1">
                <SaveCartButton />
                <Button variant="ghost" size="sm" onClick={app.clearCart}>
                  Clear
                </Button>
              </div>
            )
          }
        >
          {app.cart.length ? `${app.cart.length} ${app.cart.length === 1 ? 'item' : 'items'}` : 'Your cart is empty'}
        </SectionTitle>
        {app.cart.length === 0 ? (
          <EmptyState icon="🛒" title="Add what you need">
            Search for products, paste your shopping list, or{' '}
            <button className="font-semibold text-brand underline" onClick={() => setTab('paste')}>
              try the sample list
            </button>
            .
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {app.cart.map((line) => (
              <CartRow key={line.id} line={line} />
            ))}
          </ul>
        )}
      </section>

      {app.cart.length > 0 && (
        <>
          <section>
            <SectionTitle>How do you want to save?</SectionTitle>
            <PreferencePicker value={app.prefs.preference} onChange={(preference) => app.updatePrefs({ preference })} />
          </section>
          <DemoControls />
        </>
      )}

      {app.cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur-md md:static md:border-0 md:bg-transparent md:p-0">
          <div className="mx-auto max-w-2xl">
            {needsConfirm > 0 && <p className="mb-2 text-center text-xs text-muted">{needsConfirm} item{needsConfirm > 1 ? 's use' : ' uses'} our best guess. Tap "Confirm" to check.</p>}
            <Button size="lg" className="w-full text-[17px]" onClick={() => run()} loading={running}>
              Compare Prices
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CartRow({ line }: { line: CartLine }) {
  const { setQuantity, chooseProduct } = useApp();
  const [confirming, setConfirming] = useState(false);
  const p = line.product;
  return (
    <li className="rounded-2xl border border-line bg-surface p-3 animate-rise">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-2xl" aria-hidden>
          {p.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <Link to={`/product/${p.id}`} className="line-clamp-2 text-[15px] font-semibold leading-snug hover:underline">
            {productLabel(p)}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{productSize(p)}</span>
            {line.confidence === 'low' ? (
              <button onClick={() => setConfirming(true)} className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-ink">
                Confirm ▾
              </button>
            ) : (
              <Badge tone="brand">Ready</Badge>
            )}
          </div>
        </div>
        <Stepper value={line.quantity} onChange={(v) => setQuantity(line.id, v)} label={productLabel(p)} />
      </div>
      {line.note && <p className="mt-2 text-xs text-muted">ℹ️ {line.note}</p>}
      <Sheet open={confirming} onClose={() => setConfirming(false)} title="Which product did you mean?">
        <p className="mb-3 text-sm text-muted">
          You wrote "<strong className="text-ink">{line.query}</strong>".
        </p>
        <div className="space-y-2" role="radiogroup">
          {[p, ...line.alternatives].map((alt) => (
            <button
              key={alt.id}
              role="radio"
              aria-checked={alt.id === p.id}
              onClick={() => {
                chooseProduct(line.id, alt);
                setConfirming(false);
              }}
              className={cx('flex w-full items-center gap-3 rounded-2xl border p-3 text-left', alt.id === p.id ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2')}
            >
              <span className={cx('flex size-5 items-center justify-center rounded-full border-2', alt.id === p.id ? 'border-brand' : 'border-line')}>
                {alt.id === p.id && <span className="size-2.5 rounded-full bg-brand" />}
              </span>
              <span className="text-xl" aria-hidden>
                {alt.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{productLabel(alt)}</span>
                <span className="text-xs text-muted">{productSize(alt)}</span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </li>
  );
}

function SearchAdd() {
  const { addProduct } = useApp();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [added, setAdded] = useState<string | null>(null);

  // Debounced search; stale requests are cancelled.
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api.searchProducts(q.trim(), ctrl.signal).then(setResults).catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div>
      <label className="sr-only" htmlFor="search">
        Search products
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
          🔍
        </span>
        <input
          id="search"
          className="h-12 w-full rounded-2xl border border-line bg-bg pl-11 pr-4 text-base outline-none focus:border-brand"
          placeholder="Search e.g. Amul Taaza Milk 1L"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
      </div>
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {results.map((p) => (
            <li key={p.id}>
              <button
                className="flex w-full items-center gap-3 bg-surface px-3 py-2.5 text-left hover:bg-surface-2"
                onClick={() => {
                  addProduct(p);
                  setAdded(p.id);
                  setTimeout(() => setAdded(null), 1200);
                }}
              >
                <span className="text-xl" aria-hidden>
                  {p.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{productLabel(p)}</span>
                  <span className="text-xs text-muted">{productSize(p)}</span>
                </span>
                <span className={cx('rounded-full px-3 py-1 text-sm font-bold', added === p.id ? 'bg-brand text-brand-ink' : 'bg-brand-soft text-brand-strong')}>{added === p.id ? '✓ Added' : '+ Add'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && results.length === 0 && <p className="mt-3 text-sm text-muted">No products match "{q}" yet.</p>}
    </div>
  );
}

function PasteAdd({ onResult }: { onResult: (m: { level: 'info' | 'warning'; title: string; message: string } | null) => void }) {
  const { addResolved } = useApp();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function submit(value: string) {
    if (!value.trim()) return;
    setLoading(true);
    try {
      const { items } = await api.createCart({ text: value });
      const { added, unmatched } = addResolved(items);
      setText('');
      onResult(
        unmatched.length
          ? { level: 'warning', title: `Added ${added} item${added === 1 ? '' : 's'}`, message: `We couldn't find: ${unmatched.join(', ')}. Try searching for them.` }
          : { level: 'info', title: `Added ${added} item${added === 1 ? '' : 's'} to your cart`, message: 'Check any item marked "Confirm", then compare.' },
      );
    } catch (e) {
      onResult({ level: 'warning', title: "Couldn't read that list", message: e instanceof ApiError ? e.message : 'Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <label htmlFor="list" className="sr-only">
        Shopping list
      </label>
      <textarea
        id="list"
        ref={ref}
        rows={6}
        className="w-full resize-y rounded-2xl border border-line bg-bg p-4 font-mono text-[15px] leading-relaxed outline-none focus:border-brand"
        placeholder={DEMO_LIST}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={4000}
      />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button className="flex-1" onClick={() => submit(text)} loading={loading} disabled={!text.trim()}>
          Add to cart
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => submit(DEMO_LIST)} disabled={loading}>
          Use sample list
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">One item per line. Quantities and sizes like "Rice 5kg" or "Eggs 12" are understood.</p>
    </div>
  );
}

const UNITS = ['pcs', 'g', 'kg', 'ml', 'L'];

function ManualAdd({ onResult }: { onResult: (m: { level: 'info' | 'warning'; title: string; message: string } | null) => void }) {
  const { addResolved } = useApp();
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('pcs');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const { items } = await api.createCart({ entries: [{ query: name.trim(), quantity: qty, unit: unit === 'pcs' ? undefined : unit }] });
      const { added, unmatched } = addResolved(items);
      if (added) {
        setName('');
        setQty(1);
        onResult({ level: 'info', title: `Added ${items[0].product ? productLabel(items[0].product) : name}`, message: items[0].note ?? '' });
      } else onResult({ level: 'warning', title: 'No match found', message: `We couldn't find "${unmatched[0]}". Try a simpler name.` });
    } catch (e) {
      onResult({ level: 'warning', title: "Couldn't add that item", message: e instanceof ApiError ? e.message : 'Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="grid grid-cols-[1fr_auto_auto] gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="col-span-3 text-sm font-semibold">
        Product
        <input className="mt-1 h-12 w-full rounded-2xl border border-line bg-bg px-4 font-normal outline-none focus:border-brand" placeholder="e.g. Basmati rice" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </label>
      <label className="text-sm font-semibold">
        Quantity
        <input
          type="number"
          min={1}
          max={99}
          inputMode="decimal"
          className="tabular mt-1 h-12 w-full rounded-2xl border border-line bg-bg px-4 font-normal"
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
        />
      </label>
      <label className="text-sm font-semibold">
        Unit
        <select className="mt-1 h-12 w-24 rounded-2xl border border-line bg-bg px-3 font-normal" value={unit} onChange={(e) => setUnit(e.target.value)}>
          {UNITS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <Button type="submit" className="h-12" loading={loading} disabled={!name.trim()}>
          Add
        </Button>
      </div>
    </form>
  );
}

function SaveCartButton() {
  const { cart, savedCartId, setSavedCartId } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Weekly Groceries');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const presets = ['Weekly Groceries', 'Monthly Groceries', 'Breakfast', 'Household Essentials', 'Personal'];

  async function save() {
    setState('saving');
    try {
      const saved = await api.createSavedCart(
        name.trim() || 'My cart',
        cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      );
      setSavedCartId(saved.id);
      setState('saved');
      setTimeout(() => {
        setOpen(false);
        setState('idle');
      }, 700);
    } catch {
      setState('error');
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {savedCartId ? '★ Saved' : '☆ Save'}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Save this cart">
        <p className="mb-3 text-sm text-muted">Save carts you buy often and compare them again with today's prices in one tap.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p} onClick={() => setName(p)} className={cx('min-h-9 rounded-full border px-3 text-sm', name === p ? 'border-brand bg-brand-soft font-semibold' : 'border-line')}>
              {p}
            </button>
          ))}
        </div>
        <input className="h-12 w-full rounded-2xl border border-line bg-bg px-4" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Cart name" />
        {state === 'error' && <p className="mt-2 text-sm text-danger">Couldn't save. Please try again.</p>}
        <Button className="mt-4 w-full" size="lg" onClick={save} loading={state === 'saving'}>
          {state === 'saved' ? '✓ Saved' : 'Save cart'}
        </Button>
      </Sheet>
    </>
  );
}

function DemoControls() {
  const { simulateFailures, setSimulateFailures } = useApp();
  return (
    <details className="group rounded-2xl border border-line bg-surface p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
        <span>Demo controls</span>
        <span className="text-muted transition group-open:rotate-180">▾</span>
      </summary>
      <p className="mt-2 text-xs text-muted">Simulate a platform outage to see how SaveSmart keeps comparing the others.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PLATFORM_IDS.map((id) => {
          const on = simulateFailures.includes(id);
          return (
            <button
              key={id}
              onClick={() => setSimulateFailures(on ? simulateFailures.filter((x) => x !== id) : [...simulateFailures, id])}
              className={cx('inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm', on ? 'border-danger bg-danger-soft text-danger' : 'border-line')}
              aria-pressed={on}
            >
              <PlatformDot id={id} />
              {on ? `${PLATFORMS[id].shortName} down` : PLATFORMS[id].shortName}
            </button>
          );
        })}
      </div>
    </details>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PLATFORMS, PLATFORM_IDS, type ComparisonResponse, type PlatformId, type ShoppingPreference } from '@savesmart/shared';
import { api, ApiError, onDevice } from '../lib/api';
import { useApp, type CartLine } from '../state/AppState';
import { LogoMark } from './Logo';
import { Button, PlatformDot, Spinner, cx } from './ui';

interface RunOptions {
  lines?: CartLine[];
  preference?: ShoppingPreference;
  savedCartId?: string | null;
  replace?: boolean;
}

interface Runner {
  run: (opts?: RunOptions) => Promise<void>;
  running: boolean;
}

const Ctx = createContext<Runner | null>(null);

const STEPS = onDevice
  ? ['Reading the prices you checked', 'Matching pack sizes', 'Adding each app\'s fees', 'Optimizing your cart']
  : ['Searching platforms', 'Matching products', 'Calculating discounts', 'Calculating delivery fees', 'Optimizing your cart'];
const STEP_MS = onDevice ? 170 : 280;

/** Runs comparisons and shows the progress overlay. Fast: it never waits longer than the request needs, beyond a short readable sequence. */
export function CompareRunnerProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState<{ step: number; platformsDone: number; failed: PlatformId[]; error: string | null } | null>(null);
  const busy = useRef(false);

  const run = useCallback(
    async (opts: RunOptions = {}) => {
      if (busy.current) return;
      const lines = opts.lines ?? app.cart;
      if (!lines.length) return;
      busy.current = true;
      setState({ step: 0, platformsDone: 0, failed: [], error: null });

      const started = Date.now();
      const ticker = setInterval(() => {
        setState((s) => {
          if (!s) return s;
          const elapsed = Date.now() - started;
          const platformsDone = Math.min(PLATFORM_IDS.length, Math.floor(elapsed / 130));
          const step = Math.min(STEPS.length - 1, Math.floor(elapsed / STEP_MS));
          return { ...s, platformsDone, step };
        });
      }, 60);

      try {
        const result: ComparisonResponse = await api.compare({
          items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
          location: app.prefs.location,
          preference: opts.preference ?? app.prefs.preference,
          memberships: app.prefs.memberships,
          maxOrders: app.prefs.maxOrders,
          simulateFailures: app.simulateFailures,
          savedCartId: opts.savedCartId ?? app.savedCartId ?? undefined,
        });
        const failed = result.platforms.filter((p) => p.status !== 'ok').map((p) => p.platform.id);
        setState((s) => (s ? { ...s, failed } : s));
        // Let the short sequence finish so the steps are readable, then show the result.
        const minimum = STEP_MS * STEPS.length;
        const wait = Math.max(0, minimum - (Date.now() - started));
        await new Promise((r) => setTimeout(r, wait));
        setState((s) => (s ? { ...s, step: STEPS.length, platformsDone: PLATFORM_IDS.length } : s));
        await new Promise((r) => setTimeout(r, 220));
        app.rememberComparison(result);
        navigate(`/results/${result.id}`, { replace: opts.replace });
        setState(null);
      } catch (e) {
        setState((s) => (s ? { ...s, error: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.' } : s));
      } finally {
        clearInterval(ticker);
        busy.current = false;
      }
    },
    [app, navigate],
  );

  return (
    <Ctx.Provider value={{ run, running: state !== null }}>
      {children}
      {state && <ProgressOverlay {...state} onClose={() => setState(null)} />}
    </Ctx.Provider>
  );
}

export function useCompareRunner(): Runner {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCompareRunner must be used inside CompareRunnerProvider');
  return ctx;
}

function ProgressOverlay({ step, platformsDone, failed, error, onClose }: { step: number; platformsDone: number; failed: PlatformId[]; error: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/95 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Comparing prices">
      <div ref={ref} tabIndex={-1} className="w-full max-w-sm outline-none animate-rise">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={44} className={error ? '' : 'animate-pop'} />
          <div>
            <p className="text-lg font-bold">{error ? 'Comparison failed' : 'Comparing your cart'}</p>
            <p className="text-sm text-muted">{error ? error : 'Finding the lowest total, fees included'}</p>
          </div>
        </div>

        <ol className="space-y-3" aria-live="polite">
          <li>
            <StepRow label={STEPS[0]} state={step > 0 ? 'done' : 'active'} />
            {!onDevice && (
            <ul className="ml-9 mt-2 grid grid-cols-2 gap-2">
              {PLATFORM_IDS.map((id, i) => {
                const done = i < platformsDone;
                const bad = failed.includes(id);
                return (
                  <li key={id} className={cx('flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm transition', done ? 'opacity-100' : 'opacity-50')}>
                    <PlatformDot id={id} />
                    <span className="flex-1 font-medium">{PLATFORMS[id].shortName}</span>
                    {done ? bad ? <span className="text-danger" aria-label="failed">✕</span> : <span className="text-save" aria-label="done">✓</span> : <Spinner className="size-3 text-muted" />}
                  </li>
                );
              })}
            </ul>
            )}
          </li>
          {STEPS.slice(1).map((label, i) => (
            <li key={label}>
              <StepRow label={label} state={step > i + 1 ? 'done' : step === i + 1 ? 'active' : 'todo'} />
            </li>
          ))}
        </ol>

        {error && (
          <Button className="mt-6 w-full" variant="secondary" onClick={onClose}>
            Back to cart
          </Button>
        )}
      </div>
    </div>
  );
}

function StepRow({ label, state }: { label: string; state: 'done' | 'active' | 'todo' }) {
  return (
    <div className={cx('flex items-center gap-3 text-[15px] transition', state === 'todo' && 'opacity-40')}>
      <span
        className={cx(
          'flex size-6 items-center justify-center rounded-full text-xs font-bold',
          state === 'done' ? 'bg-brand text-brand-ink' : state === 'active' ? 'bg-brand-soft text-brand-strong' : 'bg-surface-2 text-muted',
        )}
      >
        {state === 'done' ? '✓' : state === 'active' ? <Spinner className="size-3" /> : ''}
      </span>
      <span className={cx('font-medium', state === 'active' && 'font-semibold')}>
        {label}
        {state === 'active' && '…'}
      </span>
    </div>
  );
}

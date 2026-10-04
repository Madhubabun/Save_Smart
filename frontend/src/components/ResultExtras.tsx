import { useCallback, useEffect, useState } from 'react';
import { PLATFORMS, type ComparisonResponse, type Plan, type SavingsSummary, type SmartSwap } from '@savesmart/shared';
import { api } from '../lib/api';
import { platformName, productLabel, productSize, rupees } from '../lib/format';
import { storage } from '../lib/storage';
import { useApp, type CartLine } from '../state/AppState';
import { useCompareRunner } from './CompareRunner';
import { Badge, Button, Card, SectionTitle } from './ui';

/** Cart lines rebuilt from a comparison, so actions work even when the current cart has changed since. */
function linesFrom(data: ComparisonResponse): CartLine[] {
  return data.items.map((it, i) => ({
    id: `c${i}${it.product.id}`,
    product: it.product,
    quantity: it.quantity,
    query: it.product.name,
    confidence: 'high',
    alternatives: [],
  }));
}

export function SmartSwaps({ data }: { data: ComparisonResponse }) {
  const { replaceCart } = useApp();
  const { run, running } = useCompareRunner();
  if (!data.swaps?.length) return null;

  function apply(swaps: SmartSwap[]) {
    let lines = linesFrom(data);
    for (const s of swaps) {
      lines = lines.map((l) => (l.product.id === s.from.id ? { ...l, id: `s${s.to.id}`, product: s.to, quantity: s.toQuantity, query: s.to.name } : l));
    }
    replaceCart(lines);
    run({ lines, replace: true });
  }

  return (
    <section>
      <SectionTitle
        action={
          data.swaps.length > 1 &&
          data.swapAllSaving > 0 && (
            <Button size="sm" variant="secondary" onClick={() => apply(data.swaps)} loading={running}>
              Swap all · save {rupees(Math.round(data.swapAllSaving))}
            </Button>
          )
        }
      >
        Smart swaps
      </SectionTitle>
      <div className="space-y-2">
        {data.swaps.map((s) => (
          <Card key={s.itemId} className="p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-2xl" aria-hidden>
                {s.to.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={s.kind === 'pack_size' ? 'brand' : 'accent'}>{s.kind === 'pack_size' ? 'Same product' : 'Similar product'}</Badge>
                  <span className="text-sm font-bold text-save">Plan total −{rupees(s.estimatedSaving)}</span>
                </div>
                <p className="mt-1.5 text-sm">
                  <span className="text-muted line-through">
                    {productLabel(s.from)} {productSize(s.from)} ×{s.fromQuantity}
                  </span>
                  <br />
                  <span className="font-semibold">
                    {productLabel(s.to)} {productSize(s.to)} ×{s.toQuantity}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  Same amount, {rupees(s.fromBest.total)} → {rupees(s.toBest.total)} before fees. Your new plan is worked out again when you swap.
                </p>
              </div>
              <Button size="sm" onClick={() => apply([s])} loading={running}>
                Swap
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

/** Per-order checklist so you can tick items off while adding them in each app. Remembered on this device. */
export function useChecklist(comparisonId: string) {
  const key = `ss.check.${comparisonId}`;
  const [checked, setChecked] = useState<string[]>(() => storage.getJSON<string[]>(key, []));
  useEffect(() => storage.setJSON(key, checked), [key, checked]);
  const toggle = useCallback((itemId: string) => setChecked((c) => (c.includes(itemId) ? c.filter((x) => x !== itemId) : [...c, itemId])), []);
  return { checked, toggle };
}

export function planAsText(plan: Plan, data: ComparisonResponse): string {
  const byId = new Map(data.items.map((i) => [i.itemId, i]));
  const lines = [`🛒 SaveSmart plan: ${rupees(plan.total)}${data.result.savings.amount > 0 ? ` (you save ${rupees(data.result.savings.amount)})` : ''}`];
  for (const o of plan.orders) {
    lines.push('', `${PLATFORMS[o.platform].name}: ${rupees(o.total)}`);
    for (const l of o.lines) {
      const it = byId.get(l.itemId)!;
      lines.push(`☐ ${productLabel(it.product)} ${productSize(it.product)} ×${l.quantity}`);
    }
  }
  lines.push('', data.dataSource === 'demo' ? 'Demo prices · SaveSmart' : 'SaveSmart · Shop smarter. Save more.');
  return lines.join('\n');
}

export function SharePlanButton({ plan, data }: { plan: Plan; data: ComparisonResponse }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function share() {
    const text = planAsText(plan, data);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'SaveSmart shopping plan', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setState('failed');
    }
    setTimeout(() => setState('idle'), 1800);
  }
  return (
    <Button variant="secondary" className="flex-1" onClick={share}>
      {state === 'copied' ? '✓ Copied to clipboard' : state === 'failed' ? "Couldn't share" : '↗ Share plan'}
    </Button>
  );
}

/** "Uses 38% of your monthly budget": shown only when the user set a budget. */
export function BudgetNote({ total }: { total: number }) {
  const { prefs } = useApp();
  const [summary, setSummary] = useState<SavingsSummary | null>(null);
  useEffect(() => {
    if (prefs.monthlyBudget) api.savings().then(setSummary).catch(() => {});
  }, [prefs.monthlyBudget]);
  if (!prefs.monthlyBudget || !summary) return null;
  const left = prefs.monthlyBudget - summary.thisMonthSpent;
  const over = total > left;
  return (
    <p className={over ? 'mt-3 text-sm font-semibold text-danger' : 'mt-3 text-sm text-muted'}>
      {over
        ? `This is ${rupees(Math.round(total - Math.max(left, 0)))} over what's left of your ${rupees(prefs.monthlyBudget)} monthly budget.`
        : `${rupees(Math.round(left))} left in your monthly budget; this plan uses ${Math.round((total / prefs.monthlyBudget) * 100)}% of it.`}
    </p>
  );
}

import { useEffect, useState } from 'react';
import { PLATFORMS, type SavingsSummary } from '@savesmart/shared';
import { Badge, Button, Card, EmptyState, LinkButton, PlatformDot, SectionTitle, Skeleton } from '../components/ui';
import { BudgetCard } from '../components/BudgetCard';
import { api } from '../lib/api';
import { platformName, rupees } from '../lib/format';

export function Savings() {
  const [data, setData] = useState<SavingsSummary | null>(null);
  const load = () => api.savings().then(setData).catch(() => setData(null));
  useEffect(() => {
    load();
  }, []);

  if (!data)
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">My Savings</h1>
          <p className="text-sm text-muted">Counted when you continue to a platform from a SaveSmart plan.</p>
        </div>
      </div>

      <BudgetCard thisMonthSpent={data.thisMonthSpent} thisMonthSaved={data.thisMonthSaved} />

      {data.ordersOptimized === 0 ? (
        <EmptyState
          icon="🐷"
          title="No savings yet"
          action={
            <LinkButton to="/compare">Compare a cart</LinkButton>
          }
        >
          Compare a cart and open a platform from your plan. Your savings will add up here.
        </EmptyState>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Total saved" value={rupees(data.totalSaved)} hero />
            <Kpi label="Orders optimized" value={String(data.ordersOptimized)} />
            <Kpi label="Average saving" value={`${rupees(data.averageSaving)}/order`} />
            <Kpi label="Best saving" value={rupees(data.bestSaving)} />
          </section>

          <section>
            <SectionTitle>Saved per month</SectionTitle>
            <Card className="p-4">
              <MonthlyBars monthly={data.monthly} />
            </Card>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div>
              <SectionTitle>Platforms you used</SectionTitle>
              <Card className="divide-y divide-line">
                {data.byPlatform.map((p) => (
                  <div key={p.platform} className="flex items-center gap-3 p-3.5 text-sm">
                    <PlatformDot id={p.platform} />
                    <span className="flex-1 font-medium">{PLATFORMS[p.platform].shortName}</span>
                    <span className="tabular text-muted">
                      {p.orders} {p.orders === 1 ? 'order' : 'orders'}
                    </span>
                  </div>
                ))}
              </Card>
            </div>
            <div>
              <SectionTitle>Recent</SectionTitle>
              <Card className="divide-y divide-line">
                {data.recent.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 p-3.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{e.platforms.map(platformName).join(' + ')}</p>
                      <p className="text-xs text-muted">
                        {new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · paid {rupees(e.total)}
                        
                      </p>
                    </div>
                    <span className="tabular font-bold text-save">+{rupees(e.saved)}</span>
                  </div>
                ))}
              </Card>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hero }: { label: string; value: string; hero?: boolean }) {
  return (
    <Card className={hero ? 'border-transparent bg-gradient-to-br from-emerald-600 to-emerald-800 p-4 text-white' : 'p-4'}>
      <p className={hero ? 'text-xs font-semibold text-white/80' : 'text-xs font-semibold text-muted'}>{label}</p>
      <p className="tabular mt-1 text-2xl font-extrabold">{value}</p>
    </Card>
  );
}

/** One series (rupees saved per month): single brand hue, value on hover and in the label row. */
function MonthlyBars({ monthly }: { monthly: SavingsSummary['monthly'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...monthly.map((m) => m.saved), 1);
  const label = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });
  return (
    <div>
      <div className="flex h-44 items-end gap-2" role="img" aria-label={`Savings per month: ${monthly.map((m) => `${label(m.month)} ${rupees(m.saved)}`).join(', ')}`}>
        {monthly.map((m, i) => (
          <div key={m.month} className="relative flex h-full flex-1 flex-col justify-end" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            {hover === i && (
              <div className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface px-2 py-1 text-xs shadow">
                <span className="font-semibold">{rupees(m.saved)}</span> · {m.orders} orders
              </div>
            )}
            <div className="rounded-t-[4px] bg-brand transition-all" style={{ height: `${Math.max(4, (m.saved / max) * 100)}%`, opacity: hover === null || hover === i ? 1 : 0.55 }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 border-t border-line pt-2">
        {monthly.map((m) => (
          <div key={m.month} className="flex-1 text-center text-xs text-muted">
            <span className="block">{label(m.month)}</span>
            <span className="tabular block font-semibold text-ink">{rupees(m.saved)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

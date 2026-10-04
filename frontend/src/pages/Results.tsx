import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  PLATFORMS,
  type ComparedItem,
  type ComparisonResponse,
  type Plan,
  type PlatformId,
  type PlatformOrder,
  type ShoppingPreference,
} from '@savesmart/shared';
import { useCompareRunner } from '../components/CompareRunner';
import { PreferencePicker } from '../components/PreferencePicker';
import { BudgetNote, SharePlanButton, SmartSwaps, useChecklist } from '../components/ResultExtras';
import { Badge, Button, Card, DemoBadge, EmptyState, LinkButton, Notice, PlatformDot, PlatformTile, SectionTitle, Skeleton, cx } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { PREFERENCE_LABELS, platformName, productLabel, productSize, rupees, timeAgo } from '../lib/format';
import { useApp } from '../state/AppState';

type View = 'recommended' | 'cheapest' | 'single' | 'simplest';

export function Results() {
  const { id = '' } = useParams();
  const { comparisons, rememberComparison } = useApp();
  const [data, setData] = useState<ComparisonResponse | null>(comparisons[id] ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (comparisons[id]) {
      setData(comparisons[id]);
      return;
    }
    api
      .comparison(id)
      .then((c) => {
        rememberComparison(c);
        setData(c);
      })
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'This comparison has expired.' : "Couldn't load this comparison."));
  }, [id, comparisons, rememberComparison]);

  if (error)
    return (
      <EmptyState icon="🔍" title={error} action={<LinkButton to="/compare">Back to my cart</LinkButton>}>
        Compare again to get today's prices.
      </EmptyState>
    );
  if (!data)
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  return <ResultsView key={data.id} data={data} />;
}

function samePlan(a: Plan | null | undefined, b: Plan | null | undefined) {
  return !!a && !!b && a.total === b.total && a.platforms.join() === b.platforms.join();
}

function ResultsView({ data }: { data: ComparisonResponse }) {
  const { run, running } = useCompareRunner();
  const { updatePrefs } = useApp();
  const r = data.result;
  const [view, setView] = useState<View>('recommended');
  const itemsById = useMemo(() => new Map(data.items.map((i) => [i.itemId, i])), [data.items]);
  const checklist = useChecklist(data.id);

  const plans: Record<View, Plan | null> = {
    recommended: r.recommended,
    cheapest: r.cheapestOverall,
    single: r.cheapestSingle?.plan ?? null,
    simplest: r.simplest,
  };
  const shown = plans[view] ?? r.recommended;
  const unavailable = r.unavailableItemIds.map((id) => itemsById.get(id)!).filter(Boolean);

  function changePreference(preference: ShoppingPreference) {
    updatePrefs({ preference });
    run({ preference, lines: undefined, replace: true });
  }

  if (!r.recommended) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {data.notices.map((n, i) => (
          <Notice key={i} notice={n} />
        ))}
        <EmptyState icon="😕" title="We couldn't build a plan for this cart" action={<LinkButton to="/compare">Edit cart</LinkButton>}>
          {unavailable.length ? 'None of these products are available on any platform right now.' : 'No platform could be reached. Please try again in a moment.'}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <SavingsHero data={data} />

      {(data.notices.length > 0 || unavailable.length > 0) && (
        <div className="space-y-2">
          {data.notices.map((n, i) => (
            <Notice key={i} notice={n} />
          ))}
          {unavailable.map((it) => (
            <Notice
              key={it.itemId}
              notice={{ level: 'warning', title: `${productLabel(it.product)} is unavailable everywhere`, message: "It isn't in any plan below, so totals don't include it. Try a different size or brand." }}
            />
          ))}
        </div>
      )}

      <section>
        <div className="grid gap-3 sm:grid-cols-3">
          <OptionCard medal="🥇" title="Cheapest overall" plan={r.cheapestOverall} active={view === 'cheapest' || (view === 'recommended' && samePlan(r.recommended, r.cheapestOverall))} recommended={samePlan(r.recommended, r.cheapestOverall)} reference={r.savings.referenceTotal} onClick={() => setView('cheapest')} />
          <OptionCard
            medal="🥈"
            title="Cheapest single app"
            plan={r.cheapestSingle?.plan ?? null}
            active={view === 'single' || (view === 'recommended' && samePlan(r.recommended, r.cheapestSingle?.plan) && !samePlan(r.recommended, r.cheapestOverall))}
            recommended={samePlan(r.recommended, r.cheapestSingle?.plan) && !samePlan(r.recommended, r.cheapestOverall)}
            emptyText="No single app has everything"
            onClick={() => setView('single')}
          />
          <OptionCard
            medal="🥉"
            title="Simplest option"
            plan={r.simplest}
            active={view === 'simplest' || (view === 'recommended' && samePlan(r.recommended, r.simplest) && !samePlan(r.recommended, r.cheapestOverall) && !samePlan(r.recommended, r.cheapestSingle?.plan))}
            recommended={false}
            onClick={() => setView('simplest')}
          />
        </div>
      </section>

      {shown && (
        <section>
          <SectionTitle
            action={
              view !== 'recommended' && (
                <Button variant="ghost" size="sm" onClick={() => setView('recommended')}>
                  Back to recommended
                </Button>
              )
            }
          >
            {shown.orderCount > 1 ? 'Your smart split cart' : 'Your shopping plan'}
          </SectionTitle>
          <div className="space-y-3">
            {shown.orders.map((o, i) => (
              <OrderCard key={o.platform} order={o} index={i} itemsById={itemsById} comparisonId={data.id} checklist={checklist} />
            ))}
          </div>
          <TotalCard plan={shown} data={data} />
        </section>
      )}

      <SmartSwaps data={data} />

      {r.explanations.length > 0 && (
        <section>
          <SectionTitle>Why this plan</SectionTitle>
          <Card className="divide-y divide-line">
            {r.explanations.map((e, i) => (
              <p key={i} className="flex gap-3 p-4 text-sm">
                <span aria-hidden>{i === 0 ? '💡' : '•'}</span>
                <span>{e}</span>
              </p>
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>How do you want to save?</SectionTitle>
        <PreferencePicker value={r.preference} onChange={changePreference} compact />
        {running && <p className="mt-2 text-sm text-muted">Recalculating…</p>}
      </section>

      <section>
        <SectionTitle>Every app, whole cart</SectionTitle>
        <SingleAppList data={data} />
      </section>

      <section>
        <SectionTitle>Price by item</SectionTitle>
        <div className="space-y-3">
          {data.items.map((it) => (
            <ItemComparisonCard key={it.itemId} item={it} data={data} />
          ))}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <LinkButton to="/compare" variant="secondary" className="flex-1">
          Edit cart
        </LinkButton>
        <Button variant="secondary" className="flex-1" onClick={() => run({ replace: true })} loading={running}>
          Compare again
        </Button>
        {shown && <SharePlanButton plan={shown} data={data} />}
      </div>

      <p className="text-center text-xs text-muted">
        Compared {timeAgo(data.createdAt)} for {data.location.area ? `${data.location.area}, ` : ''}
        {data.location.city} {data.location.pincode}. {data.dataSource === 'demo' ? 'Prices shown are demo data, not live prices.' : ''} SaveSmart never places orders for you.
      </p>
    </div>
  );
}

function SavingsHero({ data }: { data: ComparisonResponse }) {
  const r = data.result;
  const rec = r.recommended!;
  const saved = r.savings.amount;
  const single = r.cheapestSingle;

  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 text-white shadow-xl shadow-emerald-900/20 sm:p-8">
      <div className="absolute -right-16 -top-16 size-56 rounded-full bg-white/10" aria-hidden />
      <div className="absolute -bottom-20 -left-10 size-48 rounded-full bg-white/5" aria-hidden />
      <div className="relative">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {data.dataSource === 'demo' && <DemoBadge />}
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">{PREFERENCE_LABELS[r.preference].title}</span>
        </div>
        <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">
          {saved > 0 ? '🏆 SaveSmart found a better deal!' : rec.orderCount === 1 ? `✅ ${platformName(rec.platforms[0])} is your best option` : '✅ Here is your best plan'}
        </h1>

        <div className="mt-6 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-end">
          <div>
            {single && saved > 0 && (
              <p className="text-sm text-white/80">
                Cheapest single app ({platformName(single.platform)}): <span className="tabular font-semibold line-through decoration-white/60">{rupees(single.plan!.total)}</span>
              </p>
            )}
            <p className="mt-1 text-sm font-semibold text-white/80">{saved > 0 ? 'SaveSmart optimized cart' : 'Lowest total'}</p>
            <p className="tabular text-5xl font-extrabold tracking-tight sm:text-6xl animate-pop">{rupees(rec.total)}</p>
          </div>
          {saved > 0 && (
            <div className="relative justify-self-start sm:justify-self-end">
              <Burst />
              <div className="relative inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-emerald-800 shadow-lg animate-pop" style={{ animationDelay: '250ms' }}>
                <span className="text-2xl" aria-hidden>
                  🎉
                </span>
                <span>
                  <span className="block text-xl font-extrabold">You save {rupees(saved)}</span>
                  <span className="block text-xs font-semibold">{(Math.round(r.savings.percent * 10) / 10).toFixed(1)}% less than one app</span>
                </span>
              </div>
            </div>
          )}
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
          <Stat label="Orders" value={String(rec.orderCount)} />
          <Stat label="Fees" value={rupees(rec.feesTotal)} />
          <Stat label="Items" value={String(data.items.length - r.unavailableItemIds.length)} />
        </dl>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-2 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{label}</dt>
      <dd className="tabular text-lg font-bold">{value}</dd>
    </div>
  );
}

/** A tasteful one-shot burst behind the savings pill. */
function Burst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        const dist = 60 + (i % 3) * 18;
        return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist * 0.7, color: ['#FBBF24', '#FFFFFF', '#6EE7B7'][i % 3], delay: 250 + (i % 4) * 40 };
      }),
    [],
  );
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute size-2 rounded-sm"
          style={{ background: p.color, ['--dx' as string]: `${p.dx}px`, ['--dy' as string]: `${p.dy}px`, animation: `burst 0.9s ease-out ${p.delay}ms both` }}
        />
      ))}
    </div>
  );
}

function OptionCard({
  medal,
  title,
  plan,
  active,
  recommended,
  reference,
  emptyText,
  onClick,
}: {
  medal: string;
  title: string;
  plan: Plan | null;
  active: boolean;
  recommended: boolean;
  reference?: number | null;
  emptyText?: string;
  onClick: () => void;
}) {
  const save = plan && reference ? Math.max(0, Math.round((reference - plan.total) * 100) / 100) : 0;
  return (
    <button
      onClick={onClick}
      disabled={!plan}
      aria-pressed={active}
      className={cx('relative rounded-3xl border bg-surface p-4 text-left transition disabled:opacity-60', active ? 'border-brand ring-2 ring-brand/40' : 'border-line hover:border-brand/50')}
    >
      {recommended && <Badge tone="brand" className="absolute right-3 top-3">Recommended</Badge>}
      <p className="text-sm font-semibold text-muted">
        <span aria-hidden>{medal}</span> {title}
      </p>
      {plan ? (
        <>
          <p className="tabular mt-2 text-2xl font-extrabold">{rupees(plan.total)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              {plan.platforms.map((p) => (
                <PlatformDot key={p} id={p} />
              ))}
            </span>
            {plan.orderCount === 1 ? platformName(plan.platforms[0]) : `${plan.orderCount} platforms`}
          </p>
          {save > 0 && <p className="mt-1 text-sm font-semibold text-save">Save {rupees(save)}</p>}
          {save === 0 && <p className="mt-1 text-sm text-muted">{plan.orderCount} {plan.orderCount === 1 ? 'order' : 'orders'}</p>}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">{emptyText}</p>
      )}
    </button>
  );
}

function OrderCard({
  order,
  index,
  itemsById,
  comparisonId,
  checklist,
}: {
  order: PlatformOrder;
  index: number;
  itemsById: Map<string, ComparedItem>;
  comparisonId: string;
  checklist: ReturnType<typeof useChecklist>;
}) {
  const done = order.lines.filter((l) => checklist.checked.includes(l.itemId)).length;
  const p = PLATFORMS[order.platform];
  const fees: [string, number][] = (
    [
      ['Delivery fee', order.fees.delivery],
      ['Platform fee', order.fees.platform],
      ['Handling fee', order.fees.handling],
      ['Small-cart fee', order.fees.smallCart],
      ['Surge fee', order.fees.surge],
    ] as [string, number][]
  ).filter(([, v]) => v > 0);

  return (
    <Card as="article" className="overflow-hidden animate-rise">
      <div className="h-1.5" style={{ background: p.color }} aria-hidden />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <PlatformTile id={order.platform} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Order {index + 1}</p>
            <h3 className="text-lg font-bold">{p.name}</h3>
            <p className="text-xs text-muted">Delivery in about {p.deliveryEta}</p>
          </div>
          <p className="tabular text-2xl font-extrabold">{rupees(order.total)}</p>
        </div>

        <ul className="mt-4 space-y-1">
          {order.lines.map((line) => {
            const item = itemsById.get(line.itemId)!;
            const offer = item.offers[order.platform];
            const ticked = checklist.checked.includes(line.itemId);
            return (
              <li key={line.itemId}>
                <button
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-1.5 text-left text-[15px] hover:bg-surface-2"
                  onClick={() => checklist.toggle(line.itemId)}
                  aria-pressed={ticked}
                  aria-label={`${ticked ? 'Added' : 'Not added yet'}: ${productLabel(item.product)}`}
                >
                <span className={cx('flex size-5 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold', ticked ? 'border-brand bg-brand text-brand-ink' : 'border-line text-transparent')} aria-hidden>
                  ✓
                </span>
                <span className={cx('min-w-0 flex-1', ticked && 'text-muted line-through')}>
                  <span className="font-medium">{productLabel(item.product)}</span>{' '}
                  <span className="text-muted">
                    {productSize(item.product)} ×{line.quantity}
                  </span>
                  {offer.packNote && <span className="block text-xs text-muted">as {offer.packNote} per unit</span>}
                </span>
                <span className="tabular font-semibold">{rupees(line.lineTotal)}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-1 text-xs text-muted">{done === 0 ? 'Tick items as you add them in the app.' : `${done} of ${order.lines.length} added in ${p.shortName}`}</p>
        <details className="group mt-3 rounded-2xl bg-surface-2 px-3 py-2 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
            <span>
              Items {rupees(order.subtotal)} + fees {rupees(order.feesTotal)}
              {order.coupon && ` − coupon ${rupees(order.coupon.amount)}`}
            </span>
            <span className="text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <dl className="mt-2 space-y-1 text-muted">
            <Row label="MRP total" value={rupees(order.mrpTotal)} />
            {order.productDiscount > 0 && <Row label="Product discounts" value={`− ${rupees(order.productDiscount)}`} good />}
            <Row label="Items subtotal" value={rupees(order.subtotal)} />
            {fees.length === 0 && <Row label="Fees" value="Free delivery, no fees" good />}
            {fees.map(([label, v]) => (
              <Row key={label} label={label} value={rupees(v)} />
            ))}
            {order.coupon && <Row label={`Coupon ${order.coupon.code}`} value={`− ${rupees(order.coupon.amount)}`} good />}
            <Row label="You pay" value={rupees(order.total)} strong />
          </dl>
          {order.freeDeliveryGap !== null && order.freeDeliveryGap > 0 && (
            <p className="mt-2 text-xs">Add {rupees(order.freeDeliveryGap)} more on {p.shortName} for free delivery.</p>
          )}
        </details>

        <a
          href={p.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => api.markPurchased(comparisonId).catch(() => {})}
          className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl font-semibold text-white transition active:scale-[0.98]"
          style={{ background: p.color }}
        >
          Open {p.shortName} <span aria-hidden>↗</span>
        </a>
        <p className="mt-2 text-center text-xs text-muted">Continue your purchase on {p.shortName}. SaveSmart doesn't place the order.</p>
      </div>
    </Card>
  );
}

function Row({ label, value, good, strong }: { label: string; value: string; good?: boolean; strong?: boolean }) {
  return (
    <div className={cx('flex justify-between gap-3', strong && 'border-t border-line pt-1 font-bold text-ink')}>
      <dt>{label}</dt>
      <dd className={cx('tabular', good && 'text-save')}>{value}</dd>
    </div>
  );
}

function TotalCard({ plan, data }: { plan: Plan; data: ComparisonResponse }) {
  const ref = data.result.savings.referenceTotal;
  const save = ref ? Math.max(0, Math.round((ref - plan.total) * 100) / 100) : 0;
  return (
    <Card className="mt-3 p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted">Total for {plan.orderCount} {plan.orderCount === 1 ? 'order' : 'orders'}</p>
          <p className="tabular text-3xl font-extrabold">{rupees(plan.total)}</p>
        </div>
        {save > 0 ? (
          <div className="text-right">
            <p className="text-lg font-extrabold text-save">You save {rupees(save)}</p>
            <p className="text-xs text-muted">{((save / ref!) * 100).toFixed(1)}% vs the {data.result.savings.referenceLabel.charAt(0).toLowerCase() + data.result.savings.referenceLabel.slice(1)}</p>
          </div>
        ) : (
          <p className="text-right text-sm text-muted">{plan.couponTotal > 0 ? `Includes ${rupees(plan.couponTotal)} in coupons` : 'Fees and discounts included'}</p>
        )}
      </div>
      <BudgetNote total={plan.total} />
    </Card>
  );
}

function SingleAppList({ data }: { data: ComparisonResponse }) {
  const r = data.result;
  const names = (ids: string[]) => ids.map((id) => productLabel(data.items.find((i) => i.itemId === id)!.product)).join(', ');
  const rows = data.platforms.map((ps) => ({ ps, single: r.singleOptions.find((s) => s.platform === ps.platform.id) }));
  const best = r.cheapestSingle?.platform;
  return (
    <Card className="divide-y divide-line">
      {rows
        .sort((a, b) => (a.single?.complete && a.single.plan ? a.single.plan.total : 1e9) - (b.single?.complete && b.single.plan ? b.single.plan.total : 1e9))
        .map(({ ps, single }) => (
          <div key={ps.platform.id} className="flex items-start gap-3 p-4">
            <PlatformTile id={ps.platform.id} size={34} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold">
                {ps.platform.shortName}
                {best === ps.platform.id && <Badge tone="brand">Cheapest app</Badge>}
                {ps.isMember && <Badge>Member</Badge>}
              </p>
              {ps.status !== 'ok' ? (
                <p className="text-sm text-danger">{ps.message}</p>
              ) : single?.missingItemIds.length ? (
                <p className="text-sm text-muted">Missing {names(single.missingItemIds)}. Can't complete your cart alone.</p>
              ) : single?.belowMinOrder ? (
                <p className="text-sm text-muted">Below the {rupees(ps.fees?.minOrderValue)} minimum order.</p>
              ) : (
                <p className="text-sm text-muted">
                  Items {rupees(single?.plan?.subtotal)} · fees {rupees(single?.plan?.feesTotal)}
                  {single?.plan?.couponTotal ? ` · coupon −${rupees(single.plan.couponTotal)}` : ''}
                  {ps.fees?.surgeFee ? ` · ${ps.fees.surgeReason ?? 'surge'}` : ''}
                </p>
              )}
            </div>
            <p className={cx('tabular text-lg font-bold', single?.complete ? '' : 'text-muted')}>
              {ps.status === 'ok' && single?.plan ? (single.complete ? rupees(single.plan.total) : `${rupees(single.plan.total)}*`) : '—'}
            </p>
          </div>
        ))}
      {rows.some((x) => x.single && !x.single.complete && x.single.plan) && <p className="p-3 text-xs text-muted">* Total for the items that app has.</p>}
    </Card>
  );
}

function ItemComparisonCard({ item, data }: { item: ComparedItem; data: ComparisonResponse }) {
  const cmp = data.result.itemComparisons.find((c) => c.itemId === item.itemId)!;
  const okPlatforms = data.platforms.filter((p) => p.status === 'ok').map((p) => p.platform.id);
  const offers = okPlatforms.map((id) => item.offers[id]);
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-2xl" aria-hidden>
          {item.product.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <Link to={`/product/${item.product.id}`} className="font-semibold hover:underline">
            {productLabel(item.product)}
          </Link>
          <p className="text-xs text-muted">
            {productSize(item.product)} × {item.quantity}
          </p>
        </div>
        {cmp.cheapest && (
          <div className="text-right">
            <p className="text-xs text-muted">Cheapest</p>
            <p className="text-sm font-bold text-save">
              {platformName(cmp.cheapest.platform)} · {rupees(cmp.cheapest.unitPrice)}
            </p>
          </div>
        )}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-1.5">
        {offers.map((o) => {
          const cheapest = cmp.cheapest?.platform === o.platform;
          return (
            <li key={o.platform} className={cx('flex items-center gap-2 rounded-xl px-3 py-2 text-sm', cheapest ? 'bg-brand-soft' : 'bg-surface-2')}>
              <PlatformDot id={o.platform} />
              <span className="w-20 shrink-0 font-medium">{platformName(o.platform as PlatformId)}</span>
              {o.status === 'available' ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                    {o.discountPercent ? `${o.discountPercent}% off · ` : ''}
                    {o.unitPriceLabel}
                    {o.packNote ? ` · ${o.packNote}` : ''}
                    {o.availability === 'limited' ? ' · Few left' : ''}
                  </span>
                  {o.mrp! > o.price! && <span className="tabular text-xs text-muted line-through">{rupees(o.mrp)}</span>}
                  <span className={cx('tabular w-14 text-right font-bold', cheapest && 'text-save')}>{rupees(o.price)}</span>
                </>
              ) : (
                <span className="flex-1 text-xs text-danger">
                  {o.status === 'out_of_stock' ? `Out of stock on ${platformName(o.platform)}` : `This product is unavailable on ${platformName(o.platform)}`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        {cmp.savingsVsHighest > 0 ? <span className="font-semibold text-save">Up to {rupees(cmp.savingsVsHighest)} cheaper than the priciest app</span> : <span />}
        <span>Updated {timeAgo(offers.find((o) => o.lastUpdated)?.lastUpdated)}</span>
      </div>
    </Card>
  );
}

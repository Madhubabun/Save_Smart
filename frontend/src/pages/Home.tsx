import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PLATFORMS, PLATFORM_IDS } from '@savesmart/shared';
import { useCompareRunner } from '../components/CompareRunner';
import { ForYou } from '../components/ForYou';
import { Badge, Button, Card, PlatformDot } from '../components/ui';
import { api } from '../lib/api';
import { DEMO_LIST, useApp } from '../state/AppState';

export function Home() {
  const navigate = useNavigate();
  const { replaceCart, setSavedCartId, cart } = useApp();
  const { run } = useCompareRunner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function tryDemo() {
    setLoading(true);
    setError(null);
    try {
      const { items } = await api.createCart({ text: DEMO_LIST });
      setSavedCartId(null);
      const lines = items
        .filter((i) => i.product)
        .map((i, n) => ({ id: `demo${n}`, product: i.product!, quantity: i.quantity, query: i.query, confidence: i.confidence, alternatives: i.alternatives, note: i.note }));
      replaceCart(lines);
      await run({ lines, savedCartId: null });
    } catch {
      setError("Couldn't start the demo. Is the SaveSmart server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-12 md:space-y-16">
      <section className="grid items-center gap-8 pt-4 md:grid-cols-[1.1fr_1fr] md:pt-10">
        <div className="animate-rise">
          <Badge tone="brand" className="mb-4">
            Your cart. Every store. The lowest total.
          </Badge>
          <h1 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            Shop smarter.
            <br />
            <span className="text-brand">Save more.</span>
          </h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-muted">
            Compare prices across India's quick-commerce apps and find the cheapest way to complete your <strong className="text-ink">entire cart</strong>.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={() => navigate('/compare')}>
              Compare My Cart
              {cart.length > 0 && <span className="rounded-full bg-white/25 px-2 text-sm">{cart.length}</span>}
            </Button>
            <Button size="lg" variant="secondary" onClick={tryDemo} loading={loading}>
              Try Demo
            </Button>
          </div>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            {PLATFORM_IDS.map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5">
                <PlatformDot id={id} /> {PLATFORMS[id].shortName}
              </span>
            ))}
          </div>
        </div>

        <ExampleCard />
      </section>

      <ForYou />

      <section>
        <h2 className="text-center text-2xl font-bold tracking-tight">Don't just find the cheapest product.</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-muted">Find the cheapest way to complete your entire cart, with delivery, platform and handling fees, coupons and minimum orders included.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { icon: '📝', title: 'Add your list', text: 'Paste "Milk 2, Bread 1, Eggs 12" or search. SaveSmart understands sizes and quantities.' },
            { icon: '⚡', title: 'We compare every app', text: 'Matching products across Blinkit, Zepto, Instamart and BigBasket, including fees and coupons.' },
            { icon: '🏆', title: 'Get the lowest total', text: 'One app or a smart split: you see exactly what to buy where, and how much you save.' },
          ].map((s, i) => (
            <Card key={s.title} className="p-5 animate-rise" >
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft text-xl" aria-hidden>
                  {s.icon}
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-muted">Step {i + 1}</span>
              </div>
              <p className="mt-4 text-base font-bold">{s.title}</p>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <p className="text-sm font-semibold text-muted">The cheapest single app</p>
          <p className="tabular mt-1 text-3xl font-extrabold">₹680</p>
          <p className="mt-1 text-sm text-muted">Everything from one store</p>
          <div className="my-5 h-px bg-line" />
          <p className="text-sm font-semibold text-brand">SaveSmart's smart split</p>
          <p className="tabular mt-1 text-3xl font-extrabold text-brand">₹645</p>
          <p className="mt-1 text-sm text-muted">Two orders, fees included. You save ₹35.</p>
          <p className="mt-4 text-xs text-muted">Illustrative example.</p>
        </Card>
        <Card className="flex flex-col justify-center gap-4 p-6">
          <p className="text-xl font-bold leading-snug">"I put my grocery list into SaveSmart, and it tells me the cheapest way to buy everything."</p>
          <ul className="space-y-2 text-sm text-muted">
            <li>✓ Never splits orders just to save a rupee or two</li>
            <li>✓ Never hides unavailable products</li>
            <li>✓ Unbiased: sponsored content can never change the result</li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

/** The hero visual: an animated example of what SaveSmart does. */
function ExampleCard() {
  return (
    <div className="relative animate-rise" style={{ animationDelay: '120ms' }}>
      <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand/25 via-transparent to-accent/20 blur-2xl" aria-hidden />
      <Card className="overflow-hidden p-0 shadow-xl shadow-black/5">
        <div className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted">Your cart</p>
            <Badge>Example</Badge>
          </div>
          <p className="tabular mt-1 text-4xl font-extrabold text-muted line-through decoration-2">₹842</p>
        </div>
        <div className="border-y border-line bg-surface-2 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">SaveSmart compares</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PLATFORM_IDS.map((id, i) => (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm font-medium animate-pop" style={{ animationDelay: `${300 + i * 120}ms` }}>
                <PlatformDot id={id} /> {PLATFORMS[id].shortName}
              </span>
            ))}
          </div>
        </div>
        <div className="p-5">
          <p className="text-sm font-semibold text-brand">Best combination</p>
          <p className="tabular mt-1 text-5xl font-extrabold tracking-tight">₹756</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-2.5 text-brand-ink animate-pop" style={{ animationDelay: '900ms' }}>
            <span aria-hidden>🎉</span>
            <span className="font-bold">You save ₹86</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

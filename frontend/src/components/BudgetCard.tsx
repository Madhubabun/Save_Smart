import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { rupees } from '../lib/format';
import { useApp } from '../state/AppState';
import { Button, Card, cx } from './ui';

/**
 * Monthly grocery budget: set it once, then see this month's spend (from plans you opened) against it.
 * `thisMonthSpent` is passed in when the caller already has the savings summary.
 */
export function BudgetCard({ thisMonthSpent, thisMonthSaved }: { thisMonthSpent?: number; thisMonthSaved?: number }) {
  const { prefs, updatePrefs } = useApp();
  const budget = prefs.monthlyBudget;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(budget ? String(budget) : '');
  const [spent, setSpent] = useState<{ spent: number; saved: number } | null>(
    thisMonthSpent === undefined ? null : { spent: thisMonthSpent, saved: thisMonthSaved ?? 0 },
  );

  useEffect(() => {
    if (thisMonthSpent !== undefined) setSpent({ spent: thisMonthSpent, saved: thisMonthSaved ?? 0 });
    else if (budget)
      api
        .savings()
        .then((s) => setSpent({ spent: s.thisMonthSpent, saved: s.thisMonthSaved }))
        .catch(() => {});
  }, [budget, thisMonthSpent, thisMonthSaved]);

  const parsed = Number(value.replace(/[,₹\s]/g, ''));
  const valid = Number.isFinite(parsed) && parsed >= 100 && parsed <= 1_000_000;

  function save(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    updatePrefs({ monthlyBudget: Math.round(parsed) });
    setEditing(false);
  }

  if (!budget || editing)
    return (
      <Card className="p-4">
        <form onSubmit={save} className="space-y-3">
          <div>
            <p className="font-bold">Monthly grocery budget</p>
            <p className="text-sm text-muted">SaveSmart tracks what you spend through your plans and warns you before a cart goes over.</p>
          </div>
          <div className="flex gap-2">
            <label className="flex min-h-11 flex-1 items-center gap-1 rounded-2xl border border-line bg-surface px-3 focus-within:border-brand">
              <span className="text-muted">₹</span>
              <input
                inputMode="numeric"
                className="w-full bg-transparent outline-none"
                placeholder="e.g. 8000"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-label="Monthly budget in rupees"
              />
            </label>
            <Button type="submit" disabled={!valid}>
              {budget ? 'Save' : 'Set budget'}
            </Button>
            {budget && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
          {value && !valid && <p className="text-xs text-danger">Enter an amount between ₹100 and ₹10,00,000.</p>}
          {budget && (
            <button type="button" className="text-xs font-semibold text-muted underline" onClick={() => updatePrefs({ monthlyBudget: undefined })}>
              Remove budget
            </button>
          )}
        </form>
      </Card>
    );

  const used = spent?.spent ?? 0;
  const pct = Math.min(100, (used / budget) * 100);
  const over = used > budget;
  const month = new Date().toLocaleDateString('en-IN', { month: 'long' });
  const daysLeft = daysLeftInMonth();
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{month} budget</p>
          <p className="text-xl font-extrabold tabular">
            {rupees(Math.round(used))} <span className="text-base font-semibold text-muted">of {rupees(budget)}</span>
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => (setValue(String(budget)), setEditing(true))}>
          Edit
        </Button>
      </div>
      <div
        className="mt-3 h-3 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={Math.round(used)}
        aria-label="Budget used"
      >
        <div className={cx('h-full rounded-full transition-[width]', over ? 'bg-danger' : pct > 80 ? 'bg-accent' : 'bg-brand')} style={{ width: `${pct}%` }} />
      </div>
      <p className={cx('mt-2 text-sm', over ? 'font-semibold text-danger' : 'text-muted')}>
        {over
          ? `${rupees(Math.round(used - budget))} over budget this month.`
          : `${rupees(Math.round(budget - used))} left · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to go${
              spent && spent.saved > 0 ? ` · saved ${rupees(Math.round(spent.saved))} so far` : ''
            }`}
      </p>
    </Card>
  );
}

function daysLeftInMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
}

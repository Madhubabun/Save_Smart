import { SHOPPING_PREFERENCES, type ShoppingPreference } from '@savesmart/shared';
import { PREFERENCE_LABELS } from '../lib/format';
import { cx } from './ui';

export function PreferencePicker({ value, onChange, compact }: { value: ShoppingPreference; onChange: (p: ShoppingPreference) => void; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label="How do you want to save?" className={cx('grid gap-2', compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
      {SHOPPING_PREFERENCES.map((p) => {
        const l = PREFERENCE_LABELS[p];
        const active = value === p;
        return (
          <button
            key={p}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(p)}
            className={cx(
              'flex min-h-14 items-start gap-2.5 rounded-2xl border p-3 text-left transition',
              active ? 'border-brand bg-brand-soft ring-1 ring-brand' : 'border-line bg-surface hover:bg-surface-2',
            )}
          >
            <span className="text-lg leading-none" aria-hidden>
              {l.icon}
            </span>
            <span className="min-w-0">
              <span className={cx('block text-sm font-bold', active && 'text-brand-strong')}>{l.title}</span>
              {!compact && <span className="mt-0.5 block text-xs text-muted">{l.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

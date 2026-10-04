import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PLATFORMS, type Notice as NoticeT, type PlatformId } from '@savesmart/shared';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-strong shadow-sm shadow-brand/20',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:opacity-90',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-11 px-4 text-[15px]',
        size === 'lg' && 'min-h-14 px-6 text-base',
        variants[variant],
        className,
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'primary', size = 'md', className, children }: { to: string; variant?: Variant; size?: 'sm' | 'md' | 'lg'; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.98]',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-11 px-4 text-[15px]',
        size === 'lg' && 'min-h-14 px-6 text-base',
        variants[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block size-4 rounded-full border-2 border-current border-r-transparent animate-spin-slow', className)} aria-hidden />;
}

export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' }) {
  return <As className={cx('rounded-3xl bg-surface border border-line', className)}>{children}</As>;
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'brand' | 'accent' | 'danger' | 'info'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    brand: 'bg-brand-soft text-brand-strong',
    accent: 'bg-accent-soft text-ink',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-ink',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="accent" className={className}>
      <span aria-hidden>●</span> Demo prices
    </Badge>
  );
}

export function PlatformDot({ id, className }: { id: PlatformId; className?: string }) {
  return <span className={cx('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ background: PLATFORMS[id].color }} aria-hidden />;
}

/** A coloured monogram tile used instead of platform logos. */
export function PlatformTile({ id, size = 40 }: { id: PlatformId; size?: number }) {
  const p = PLATFORMS[id];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl font-bold text-white"
      style={{ background: p.color, width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {p.shortName[0]}
    </span>
  );
}

export function Notice({ notice, onClose }: { notice: NoticeT; onClose?: () => void }) {
  const tone = notice.level === 'error' ? 'bg-danger-soft' : notice.level === 'warning' ? 'bg-accent-soft' : 'bg-info-soft';
  const icon = notice.level === 'error' ? '⛔' : notice.level === 'warning' ? '⚠️' : 'ℹ️';
  return (
    <div className={cx('flex gap-3 rounded-2xl p-3.5 text-sm animate-rise', tone)} role={notice.level === 'info' ? 'status' : 'alert'}>
      <span aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{notice.title}</p>
        {notice.message && <p className="mt-0.5 text-muted">{notice.message}</p>}
      </div>
      {onClose && (
        <button className="text-muted" onClick={onClose} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex items-end justify-between gap-3', className)}>
      <h2 className="text-lg font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <div className="mb-3 text-4xl" aria-hidden>
        {icon}
      </div>
      <p className="text-base font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-surface" role="group" aria-label={`Quantity of ${label}`}>
      <button className="flex size-9 items-center justify-center rounded-full text-lg font-semibold hover:bg-surface-2" onClick={() => onChange(value - 1)} aria-label={value <= 1 ? `Remove ${label}` : `Decrease ${label}`}>
        {value <= 1 ? '🗑' : '−'}
      </button>
      <span className="tabular w-7 text-center text-sm font-bold" aria-live="polite">
        {value}
      </span>
      <button className="flex size-9 items-center justify-center rounded-full text-lg font-semibold hover:bg-surface-2" onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  );
}

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="safe-bottom relative max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl animate-rise sm:max-w-lg sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="flex size-9 items-center justify-center rounded-full hover:bg-surface-2" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-2xl', className)} />;
}

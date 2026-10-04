import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Suspense, useEffect } from 'react';
import { useApp, type ThemeChoice } from '../state/AppState';
import { Logo } from './Logo';
import { cx } from './ui';
import { onDevice } from '../lib/api';

const NAV = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/compare', label: 'Cart', icon: CartIcon },
  { to: '/saved', label: 'Saved', icon: BookmarkIcon },
  { to: '/savings', label: 'Savings', icon: PiggyIcon },
  { to: '/alerts', label: 'Alerts', icon: BellIcon },
];

export function Layout() {
  const { cart } = useApp();
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to="/" aria-label="SaveSmart home">
            <Logo size={30} />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.slice(1).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => cx('rounded-xl px-3 py-2 text-sm font-semibold transition', isActive ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:text-ink')}
              >
                {n.label}
                {n.to === '/compare' && cart.length > 0 && <span className="ml-1.5 rounded-full bg-brand px-1.5 text-xs text-brand-ink">{cart.length}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NavLink to="/settings" className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" aria-label="Settings">
              <GearIcon />
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-32 pt-4 md:pb-16">
        <Suspense fallback={<div className="skeleton h-40 rounded-3xl" />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="mx-auto hidden max-w-5xl px-4 pb-10 text-xs text-muted md:block">
        {onDevice
          ? 'SaveSmart compares the prices you check in each app. They stay on this device and are never shared. '
          : 'Prices come from SaveSmart\'s licensed price feed. '}
        SaveSmart never places orders: you finish your purchase in the platform's own app or website.
      </footer>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx('relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold', isActive ? 'text-brand' : 'text-muted')}
            >
              <n.icon />
              {n.label}
              {n.to === '/compare' && cart.length > 0 && (
                <span className="tabular absolute right-[22%] top-2 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] leading-4 text-brand-ink">{cart.length}</span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useApp();
  const next: Record<ThemeChoice, ThemeChoice> = { system: 'dark', dark: 'light', light: 'system' };
  const label = { system: 'System theme', dark: 'Dark theme', light: 'Light theme' }[theme];
  return (
    <button
      className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
      onClick={() => setTheme(next[theme])}
      aria-label={`${label}. Switch theme`}
      title={label}
    >
      {theme === 'dark' ? <MoonIcon /> : theme === 'light' ? <SunIcon /> : <AutoIcon />}
    </button>
  );
}

const icon = 'size-6';
function HomeIcon() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function CartIcon() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  );
}
function BookmarkIcon() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}
function PiggyIcon() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 13a7 6 0 0 1 12-4h2l1-2v4l1.5 1v3H19l-2 3v2h-3v-1.5h-4V21H7v-2.5A6 6 0 0 1 4 13Z" />
      <path d="M10 8h3" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
function AutoIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" />
    </svg>
  );
}

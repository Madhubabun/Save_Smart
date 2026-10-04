import { PLATFORMS, PLATFORM_IDS } from '@savesmart/shared';
import { LocationChip } from '../components/LocationPicker';
import { PreferencePicker } from '../components/PreferencePicker';
import { Card, PlatformDot, SectionTitle, cx } from '../components/ui';
import { useApp, type ThemeChoice } from '../state/AppState';
import { Logo } from '../components/Logo';
import { BudgetCard } from '../components/BudgetCard';
import { Button } from '../components/ui';
import { useInstallPrompt } from '../lib/pwa';

const MEMBERSHIPS: Record<string, string> = { zepto: 'Zepto Pass', instamart: 'Swiggy One', bigbasket: 'BB Star' };

export function Settings() {
  const { prefs, updatePrefs, theme, setTheme } = useApp();
  const pwa = useInstallPrompt();
  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>

      <section>
        <SectionTitle>Delivery location</SectionTitle>
        <LocationChip />
      </section>

      <section>
        <SectionTitle>How do you want to save?</SectionTitle>
        <PreferencePicker value={prefs.preference} onChange={(preference) => updatePrefs({ preference })} />
      </section>

      <section>
        <SectionTitle>Budget</SectionTitle>
        <BudgetCard />
      </section>

      <section>
        <SectionTitle>Maximum orders per shop</SectionTitle>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Maximum number of orders">
          {[undefined, 1, 2, 3].map((n) => (
            <button
              key={String(n)}
              role="radio"
              aria-checked={prefs.maxOrders === n}
              onClick={() => updatePrefs({ maxOrders: n })}
              className={cx('min-h-11 rounded-2xl border text-sm font-semibold', prefs.maxOrders === n ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface')}
            >
              {n === undefined ? 'No limit' : `${n} max`}
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Memberships</SectionTitle>
        <p className="-mt-2 mb-3 text-sm text-muted">Members often get free delivery on smaller orders. SaveSmart includes that in every total.</p>
        <Card className="divide-y divide-line">
          {PLATFORM_IDS.filter((id) => MEMBERSHIPS[id]).map((id) => {
            const on = prefs.memberships.includes(id);
            return (
              <label key={id} className="flex min-h-14 cursor-pointer items-center gap-3 px-4">
                <PlatformDot id={id} />
                <span className="flex-1 text-sm font-medium">
                  {MEMBERSHIPS[id]} <span className="text-muted">({PLATFORMS[id].shortName})</span>
                </span>
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--brand)]"
                  checked={on}
                  onChange={() => updatePrefs({ memberships: on ? prefs.memberships.filter((m) => m !== id) : [...prefs.memberships, id] })}
                />
              </label>
            );
          })}
        </Card>
      </section>

      <section>
        <SectionTitle>Appearance</SectionTitle>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {(['light', 'dark', 'system'] as ThemeChoice[]).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              onClick={() => setTheme(t)}
              className={cx('min-h-11 rounded-2xl border text-sm font-semibold capitalize', theme === t ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface')}
            >
              {t === 'light' ? '☀️ Light' : t === 'dark' ? '🌙 Dark' : '⚙️ System'}
            </button>
          ))}
        </div>
      </section>

      {pwa.available && (
        <Card className="flex items-center gap-3 p-4">
          <span className="text-2xl" aria-hidden>
            📲
          </span>
          <div className="flex-1">
            <p className="font-bold">Install SaveSmart</p>
            <p className="text-sm text-muted">Open it from your home screen, like any other app.</p>
          </div>
          <Button size="sm" onClick={pwa.install}>
            Install
          </Button>
        </Card>
      )}

      <section>
        <SectionTitle>About SaveSmart</SectionTitle>
        <Card className="space-y-3 p-5 text-sm text-muted">
          <Logo size={28} showTagline />
          <p>
            Prices come from a <strong className="text-ink">licensed price feed</strong> where one is connected, and from <strong className="text-ink">prices shoppers saw in the apps</strong> and
            shared. Shared prices use the middle value of recent reports nearby, count each person once and expire after 3 days. Every price shows when it was last seen.
          </p>
          <p>SaveSmart never scrapes the apps or gets around their protections.</p>
          <p>SaveSmart never places orders. You continue your purchase on the platform you choose.</p>
          <p>Sponsored content, when it arrives, will always be labelled "Sponsored" and can never change which option is cheapest.</p>
        </Card>
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { LocationOption } from '@savesmart/shared';
import { api } from '../lib/api';
import { useApp } from '../state/AppState';
import { Button, Sheet, cx } from './ui';

/** Manual location selection. GPS is never required. */
export function LocationChip({ className }: { className?: string }) {
  const { prefs } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={cx('inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-semibold hover:bg-surface-2', className)}
        onClick={() => setOpen(true)}
        aria-label={`Delivery location: ${prefs.location.area}, ${prefs.location.city}. Change`}
      >
        <span aria-hidden>📍</span>
        <span className="truncate">
          {prefs.location.area ? `${prefs.location.area}, ` : ''}
          {prefs.location.city}
        </span>
        <span className="text-muted">{prefs.location.pincode}</span>
        <span className="text-muted" aria-hidden>
          ▾
        </span>
      </button>
      <LocationSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function LocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, updatePrefs } = useApp();
  const [options, setOptions] = useState<LocationOption[]>([]);
  const [city, setCity] = useState(prefs.location.city);
  const [area, setArea] = useState(prefs.location.area);
  const [pincode, setPincode] = useState(prefs.location.pincode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) api.locations().then(setOptions).catch(() => {});
  }, [open]);

  const cities = [...new Set(options.map((o) => o.city))];

  function save() {
    if (pincode && !/^[1-9][0-9]{5}$/.test(pincode)) {
      setError('Pincode must be 6 digits.');
      return;
    }
    if (!city.trim()) {
      setError('Enter a city.');
      return;
    }
    updatePrefs({ location: { city: city.trim(), area: area.trim(), pincode } });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Delivery location">
      <p className="mb-4 text-sm text-muted">Prices, fees and availability depend on where you are. Pick an area or type your pincode; no GPS needed.</p>
      <div className="max-h-56 space-y-4 overflow-y-auto pr-1">
        {cities.map((c) => (
          <div key={c}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{c}</p>
            <div className="flex flex-wrap gap-2">
              {options
                .filter((o) => o.city === c)
                .map((o) => {
                  const active = o.pincode === pincode;
                  return (
                    <button
                      key={o.pincode}
                      onClick={() => {
                        setCity(o.city);
                        setArea(o.area);
                        setPincode(o.pincode);
                        setError(null);
                      }}
                      className={cx('min-h-10 rounded-full border px-3.5 text-sm font-medium', active ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line hover:bg-surface-2')}
                    >
                      {o.area} · {o.pincode}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <label className="col-span-2 text-sm font-semibold sm:col-span-1">
          City
          <input className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 font-normal" value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} />
        </label>
        <label className="text-sm font-semibold">
          Area
          <input className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 font-normal" value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} />
        </label>
        <label className="text-sm font-semibold">
          Pincode
          <input
            className="tabular mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 font-normal"
            inputMode="numeric"
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <Button className="mt-5 w-full" size="lg" onClick={save}>
        Use this location
      </Button>
    </Sheet>
  );
}

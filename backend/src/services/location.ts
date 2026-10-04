import type { Location, LocationOption, Notice } from '@savesmart/shared';
import { DEFAULT_LOCATION, DEMO_LOCATIONS, findDemoLocation } from '@savesmart/platform-adapters';

export function listLocations(): LocationOption[] {
  return DEMO_LOCATIONS.map((l) => ({ ...l }));
}

/**
 * Resolves what the user entered into a location we have data for.
 * Never requires GPS: manual city/area/pincode always works, and an unknown
 * pincode falls back to the city (or the default) with a clear notice.
 */
export function resolveLocation(input: Partial<Location> | undefined, source: 'feed' | 'demo' = 'demo'): { location: Location; notice?: Notice } {
  if (!input?.pincode && !input?.city) return { location: strip(DEFAULT_LOCATION) };
  // A live feed covers wherever the platforms deliver: use exactly what the user entered.
  if (source === 'feed') return { location: { city: input.city?.trim() || '', area: input.area?.trim() || '', pincode: input.pincode?.trim() || '' } };
  if (input.pincode) {
    const exact = findDemoLocation(input.pincode);
    if (exact) return { location: strip(exact) };
  }
  const city = DEMO_LOCATIONS.find((l) => l.city.toLowerCase() === input.city?.trim().toLowerCase());
  if (city) {
    return {
      location: { city: city.city, area: input.area?.trim() || city.area, pincode: input.pincode || city.pincode },
      notice: input.pincode
        ? { level: 'info', title: 'Using city-wide prices', message: `We don't have area-level data for ${input.pincode} yet, so these are typical ${city.city} prices.` }
        : undefined,
    };
  }
  return {
    location: strip(DEFAULT_LOCATION),
    notice: {
      level: 'warning',
      title: 'Location unavailable',
      message: `SaveSmart doesn't have data for ${input.city || input.pincode} yet. Showing ${DEFAULT_LOCATION.area}, ${DEFAULT_LOCATION.city} prices instead.`,
    },
  };
}

function strip(l: Location): Location {
  return { city: l.city, area: l.area, pincode: l.pincode };
}

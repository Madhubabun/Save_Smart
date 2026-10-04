import type { Location, PlatformId } from '@savesmart/shared';
import type { PlatformSource } from '../PlatformAdapter.js';
import { DemoDataProvider } from './DemoDataProvider.js';
import type { BigBasketRawProduct, BlinkitRawProduct, InstamartRawProduct, ZeptoRawProduct } from './rawTypes.js';

export interface DemoSourceOptions {
  /** Simulated network latency per request, so parallel fetching is visible in the UI. */
  latencyMs?: number;
}

function source<T>(
  provider: DemoDataProvider,
  platform: PlatformId,
  feed: (location: Location) => T[],
  opts: DemoSourceOptions,
): PlatformSource<T> {
  const delay = () => new Promise((r) => setTimeout(r, opts.latencyMs ?? 0));
  return {
    dataSource: 'demo',
    serviceable: async (location) => provider.isServiceable(platform, location),
    catalog: async (location) => {
      await delay();
      return feed(location);
    },
    fees: async (location) => provider.fees(platform, location),
  };
}

export function demoSources(provider: DemoDataProvider, opts: DemoSourceOptions = {}) {
  return {
    blinkit: source<BlinkitRawProduct>(provider, 'blinkit', (l) => provider.blinkitFeed(l), opts),
    zepto: source<ZeptoRawProduct>(provider, 'zepto', (l) => provider.zeptoFeed(l), opts),
    instamart: source<InstamartRawProduct>(provider, 'instamart', (l) => provider.instamartFeed(l), opts),
    bigbasket: source<BigBasketRawProduct>(provider, 'bigbasket', (l) => provider.bigbasketFeed(l), opts),
  };
}

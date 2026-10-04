import { DemoDataProvider } from './demo/DemoDataProvider.js';
import { demoSources, type DemoSourceOptions } from './demo/sources.js';
import { BigBasketAdapter, BlinkitAdapter, InstamartAdapter, ZeptoAdapter } from './adapters.js';
import type { PlatformAdapter } from './PlatformAdapter.js';

export * from './PlatformAdapter.js';
export * from './adapters.js';
export * from './demo/DemoDataProvider.js';
export * from './demo/catalog.js';
export * from './demo/locations.js';
export * from './demo/sources.js';
export type * from './demo/rawTypes.js';
export * from './feed/FeedAdapter.js';
export type * from './feed/contract.js';

/** Builds the four adapters on top of the demo data provider. Swap the sources to go live. */
export function createDemoAdapters(provider = new DemoDataProvider(), opts: DemoSourceOptions = {}): PlatformAdapter[] {
  const sources = demoSources(provider, opts);
  return [
    new BlinkitAdapter(sources.blinkit),
    new ZeptoAdapter(sources.zepto),
    new InstamartAdapter(sources.instamart),
    new BigBasketAdapter(sources.bigbasket),
  ];
}

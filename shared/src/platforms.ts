import type { PlatformId, PlatformInfo } from './types.js';

/** Static, display-only metadata about supported platforms. Prices and fees come from adapters. */
export const PLATFORMS: Record<PlatformId, PlatformInfo> = {
  blinkit: {
    id: 'blinkit',
    name: 'Blinkit',
    shortName: 'Blinkit',
    color: '#E5B400',
    websiteUrl: 'https://blinkit.com',
    deliveryEta: '10 min',
  },
  zepto: {
    id: 'zepto',
    name: 'Zepto',
    shortName: 'Zepto',
    color: '#7B2FF7',
    websiteUrl: 'https://www.zeptonow.com',
    deliveryEta: '10 min',
  },
  instamart: {
    id: 'instamart',
    name: 'Swiggy Instamart',
    shortName: 'Instamart',
    color: '#FC8019',
    websiteUrl: 'https://www.swiggy.com/instamart',
    deliveryEta: '15 min',
  },
  bigbasket: {
    id: 'bigbasket',
    name: 'BigBasket (BB Now)',
    shortName: 'BigBasket',
    color: '#6FA81E',
    websiteUrl: 'https://www.bigbasket.com',
    deliveryEta: '15 min',
  },
};

/** Public search URL on each platform. Used for "Open <platform>" hand-offs. */
export function platformSearchUrl(platform: PlatformId, query: string): string {
  const q = encodeURIComponent(query);
  switch (platform) {
    case 'blinkit':
      return `https://blinkit.com/s/?q=${q}`;
    case 'zepto':
      return `https://www.zeptonow.com/search?query=${q}`;
    case 'instamart':
      return `https://www.swiggy.com/instamart/search?query=${q}`;
    case 'bigbasket':
      return `https://www.bigbasket.com/ps/?q=${q}`;
  }
}

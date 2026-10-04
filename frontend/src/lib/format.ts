import { PLATFORMS, formatRupees, formatSize, type CatalogProduct, type PlatformId, type ShoppingPreference } from '@savesmart/shared';

export { formatRupees, formatSize };

export const rupees = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : formatRupees(n));

export const platformName = (id: PlatformId): string => PLATFORMS[id].shortName;

export const productLabel = (p: CatalogProduct): string => [p.brand, p.name, p.variant].filter(Boolean).join(' ');

export const productSize = (p: CatalogProduct): string => formatSize(p.size, p.packCount);

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export const PREFERENCE_LABELS: Record<ShoppingPreference, { title: string; hint: string; icon: string }> = {
  balanced: { title: 'Balanced', hint: 'Split only when it really saves', icon: '⚖️' },
  max_savings: { title: 'Maximum savings', hint: 'Lowest total, any number of orders', icon: '💰' },
  min_orders: { title: 'Fewer orders', hint: 'As few deliveries as possible', icon: '📦' },
  one_platform: { title: 'Prefer one platform', hint: 'Everything from a single app', icon: '🛒' },
};

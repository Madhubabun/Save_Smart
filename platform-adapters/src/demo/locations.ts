import type { Location, PlatformId } from '@savesmart/shared';

export interface DemoLocation extends Location {
  /** Platforms that deliver here in the demo data. */
  serviceable: PlatformId[];
}

const ALL: PlatformId[] = ['blinkit', 'zepto', 'instamart', 'bigbasket'];

export const DEMO_LOCATIONS: DemoLocation[] = [
  { city: 'Bengaluru', area: 'Whitefield', pincode: '560066', serviceable: ALL },
  { city: 'Bengaluru', area: 'Koramangala', pincode: '560034', serviceable: ALL },
  { city: 'Bengaluru', area: 'Indiranagar', pincode: '560038', serviceable: ALL },
  { city: 'Mumbai', area: 'Andheri West', pincode: '400058', serviceable: ALL },
  { city: 'Mumbai', area: 'Powai', pincode: '400076', serviceable: ALL },
  { city: 'Delhi', area: 'Saket', pincode: '110017', serviceable: ALL },
  { city: 'Delhi', area: 'Dwarka', pincode: '110075', serviceable: ['blinkit', 'zepto', 'instamart'] },
  { city: 'Gurugram', area: 'DLF Phase 3', pincode: '122002', serviceable: ALL },
  { city: 'Hyderabad', area: 'Gachibowli', pincode: '500032', serviceable: ALL },
  { city: 'Pune', area: 'Kothrud', pincode: '411038', serviceable: ['blinkit', 'zepto', 'bigbasket'] },
  { city: 'Chennai', area: 'Velachery', pincode: '600042', serviceable: ALL },
];

export const DEFAULT_LOCATION: DemoLocation = DEMO_LOCATIONS[0];

/** City-level price factors per platform: quick-commerce prices differ by city. */
export const CITY_PRICE_FACTOR: Record<string, Partial<Record<PlatformId, number>>> = {
  Bengaluru: {},
  Mumbai: { blinkit: 1.03, zepto: 1.02, instamart: 1.04, bigbasket: 1.05 },
  Delhi: { blinkit: 0.98, zepto: 1.01, instamart: 1.0, bigbasket: 1.03 },
  Gurugram: { blinkit: 0.99, zepto: 1.02, instamart: 1.01, bigbasket: 1.04 },
  Hyderabad: { blinkit: 1.01, zepto: 0.99, instamart: 0.98, bigbasket: 1.0 },
  Pune: { blinkit: 1.0, zepto: 1.01, bigbasket: 0.99 },
  Chennai: { blinkit: 1.02, zepto: 1.0, instamart: 0.99, bigbasket: 1.01 },
};

/** Area-specific surcharges (bad weather, high demand) in the demo data. */
export const AREA_SURGE: Record<string, Partial<Record<PlatformId, { fee: number; reason: string }>>> = {
  '400058': { zepto: { fee: 15, reason: 'High demand in your area' } },
  '110017': { blinkit: { fee: 10, reason: 'Rain surge' } },
};

export function findDemoLocation(pincode: string): DemoLocation | undefined {
  return DEMO_LOCATIONS.find((l) => l.pincode === pincode);
}

import type { BaseUnit, CatalogProduct, ProductCategory } from '@savesmart/shared';

/**
 * SaveSmart's canonical demo catalog. In production this lives in the
 * `products` / `product_variants` tables; MRPs here are approximate and only
 * feed the DemoDataProvider. Product names end with their head noun
 * ("Taaza Toned Milk") which helps ranking generic searches.
 */
type Row = [
  id: string,
  brand: string,
  name: string,
  variant: string,
  size: number,
  unit: BaseUnit,
  category: ProductCategory,
  emoji: string,
  mrp: number,
  popularity: number,
  keywords?: string[],
  packCount?: number,
];

const ROWS: Row[] = [
  // Dairy & Eggs
  ['amul-taaza-1l', 'Amul', 'Taaza Toned Milk', '', 1000, 'ml', 'Dairy & Eggs', '🥛', 56, 95, ['doodh', 'toned']],
  ['amul-taaza-500ml', 'Amul', 'Taaza Toned Milk', '', 500, 'ml', 'Dairy & Eggs', '🥛', 28, 80, ['doodh', 'toned']],
  ['amul-gold-1l', 'Amul', 'Gold Full Cream Milk', '', 1000, 'ml', 'Dairy & Eggs', '🥛', 68, 85, ['doodh', 'full cream']],
  ['mother-dairy-toned-1l', 'Mother Dairy', 'Toned Milk', '', 1000, 'ml', 'Dairy & Eggs', '🥛', 56, 72, ['doodh']],
  ['nandini-toned-500ml', 'Nandini', 'Toned Milk', '', 500, 'ml', 'Dairy & Eggs', '🥛', 24, 60, ['doodh']],
  ['amul-masti-curd-400g', 'Amul', 'Masti Curd', '', 400, 'g', 'Dairy & Eggs', '🥣', 35, 70, ['dahi', 'yogurt']],
  ['amul-butter-100g', 'Amul', 'Salted Butter', '', 100, 'g', 'Dairy & Eggs', '🧈', 58, 80, ['makhan']],
  ['amul-cheese-slices-200g', 'Amul', 'Cheese Slices', '', 200, 'g', 'Dairy & Eggs', '🧀', 145, 55],
  ['amul-paneer-200g', 'Amul', 'Malai Paneer', '', 200, 'g', 'Dairy & Eggs', '🧀', 90, 65, ['cottage cheese']],
  ['white-eggs-6', '', 'White Eggs', '', 6, 'pcs', 'Dairy & Eggs', '🥚', 48, 70, ['anda', 'egg']],
  ['white-eggs-12', '', 'White Eggs', '', 12, 'pcs', 'Dairy & Eggs', '🥚', 92, 90, ['anda', 'egg']],
  ['white-eggs-30', '', 'White Eggs', '', 30, 'pcs', 'Dairy & Eggs', '🥚', 215, 50, ['anda', 'egg']],
  ['brown-eggs-6', '', 'Brown Eggs', '', 6, 'pcs', 'Dairy & Eggs', '🥚', 72, 35, ['anda', 'egg']],

  // Bakery
  ['britannia-white-bread-400g', 'Britannia', 'White Bread', '', 400, 'g', 'Bakery', '🍞', 45, 85, ['loaf', 'sandwich']],
  ['britannia-brown-bread-400g', 'Britannia', 'Brown Bread', '', 400, 'g', 'Bakery', '🍞', 55, 62, ['loaf']],
  ['modern-whole-wheat-bread-400g', 'Modern', 'Whole Wheat Bread', '', 400, 'g', 'Bakery', '🍞', 55, 50, ['loaf', 'atta bread']],
  ['britannia-rusk-300g', 'Britannia', 'Premium Bake Rusk', '', 300, 'g', 'Bakery', '🥖', 60, 40, ['toast']],
  ['english-oven-pav-200g', 'English Oven', 'Pav Bun', '', 200, 'g', 'Bakery', '🥯', 30, 45, ['pav', 'bun']],

  // Fruits & Vegetables
  ['hybrid-tomato-1kg', '', 'Hybrid Tomato', '', 1000, 'g', 'Fruits & Vegetables', '🍅', 50, 90, ['tamatar']],
  ['hybrid-tomato-500g', '', 'Hybrid Tomato', '', 500, 'g', 'Fruits & Vegetables', '🍅', 26, 70, ['tamatar']],
  ['onion-1kg', '', 'Onion', '', 1000, 'g', 'Fruits & Vegetables', '🧅', 45, 90, ['pyaz', 'pyaaz', 'kanda']],
  ['potato-1kg', '', 'Potato', '', 1000, 'g', 'Fruits & Vegetables', '🥔', 40, 88, ['aloo', 'batata']],
  ['robusta-banana-6', '', 'Robusta Banana', '', 6, 'pcs', 'Fruits & Vegetables', '🍌', 48, 75, ['kela']],
  ['shimla-apple-4', '', 'Shimla Apple', '', 4, 'pcs', 'Fruits & Vegetables', '🍎', 160, 60, ['seb']],
  ['coriander-100g', '', 'Coriander', '', 100, 'g', 'Fruits & Vegetables', '🌿', 15, 60, ['dhania', 'cilantro']],
  ['green-chilli-100g', '', 'Green Chilli', '', 100, 'g', 'Fruits & Vegetables', '🌶️', 12, 55, ['mirchi', 'chili']],
  ['lemon-250g', '', 'Lemon', '', 250, 'g', 'Fruits & Vegetables', '🍋', 30, 50, ['nimbu', 'lime']],
  ['ginger-100g', '', 'Ginger', '', 100, 'g', 'Fruits & Vegetables', '🫚', 20, 50, ['adrak']],

  // Staples
  ['daawat-rozana-basmati-5kg', 'Daawat', 'Rozana Basmati Rice', '', 5000, 'g', 'Staples', '🍚', 520, 80, ['chawal']],
  ['india-gate-classic-basmati-1kg', 'India Gate', 'Classic Basmati Rice', '', 1000, 'g', 'Staples', '🍚', 230, 60, ['chawal']],
  ['fortune-sona-masoori-5kg', 'Fortune', 'Sona Masoori Rice', '', 5000, 'g', 'Staples', '🍚', 425, 70, ['chawal']],
  ['aashirvaad-atta-5kg', 'Aashirvaad', 'Whole Wheat Atta', '', 5000, 'g', 'Staples', '🌾', 305, 90, ['flour', 'gehu', 'chakki']],
  ['aashirvaad-atta-10kg', 'Aashirvaad', 'Whole Wheat Atta', '', 10000, 'g', 'Staples', '🌾', 565, 60, ['flour', 'gehu', 'chakki']],
  ['tata-salt-1kg', 'Tata', 'Iodised Salt', '', 1000, 'g', 'Staples', '🧂', 28, 85, ['namak']],
  ['fortune-sunflower-oil-1l', 'Fortune', 'Sunlite Refined Sunflower Oil', '', 1000, 'ml', 'Staples', '🫗', 175, 80, ['tel', 'cooking']],
  ['saffola-gold-oil-1l', 'Saffola', 'Gold Blended Oil', '', 1000, 'ml', 'Staples', '🫗', 210, 60, ['tel', 'cooking']],
  ['tata-sampann-toor-dal-1kg', 'Tata Sampann', 'Unpolished Toor Dal', '', 1000, 'g', 'Staples', '🫘', 210, 70, ['arhar', 'tur', 'lentil']],
  ['tata-sampann-moong-dal-500g', 'Tata Sampann', 'Yellow Moong Dal', '', 500, 'g', 'Staples', '🫘', 95, 55, ['lentil']],
  ['madhur-sugar-1kg', 'Madhur', 'Pure Sugar', '', 1000, 'g', 'Staples', '🍬', 60, 75, ['cheeni', 'chini', 'shakkar']],

  // Beverages
  ['tata-tea-gold-500g', 'Tata Tea', 'Gold Leaf Tea', '', 500, 'g', 'Beverages', '🍵', 330, 75, ['chai', 'patti']],
  ['red-label-tea-500g', 'Brooke Bond', 'Red Label Tea', '', 500, 'g', 'Beverages', '🍵', 290, 70, ['chai', 'patti']],
  ['nescafe-classic-100g', 'Nescafe', 'Classic Instant Coffee', '', 100, 'g', 'Beverages', '☕', 340, 60],
  ['coca-cola-750ml', 'Coca-Cola', 'Soft Drink', '', 750, 'ml', 'Beverages', '🥤', 40, 60, ['coke', 'cola', 'cold']],
  ['real-mixed-fruit-juice-1l', 'Real', 'Mixed Fruit Juice', '', 1000, 'ml', 'Beverages', '🧃', 125, 50],

  // Snacks & Biscuits
  ['good-day-cashew-200g', 'Britannia', 'Good Day Cashew Biscuits', '', 200, 'g', 'Snacks & Biscuits', '🍪', 40, 88, ['cookies']],
  ['parle-g-800g', 'Parle', 'G Original Glucose Biscuits', '', 800, 'g', 'Snacks & Biscuits', '🍪', 90, 82, ['parle-g', 'parleg']],
  ['marie-gold-250g', 'Britannia', 'Marie Gold Biscuits', '', 250, 'g', 'Snacks & Biscuits', '🍪', 40, 60],
  ['oreo-120g', 'Cadbury', 'Oreo Chocolate Cream Biscuits', '', 120, 'g', 'Snacks & Biscuits', '🍪', 35, 55, ['cookies']],
  ['lays-classic-salted-52g', "Lay's", 'Classic Salted Chips', '', 52, 'g', 'Snacks & Biscuits', '🥔', 20, 70, ['crisps', 'wafers']],
  ['kurkure-masala-munch-90g', 'Kurkure', 'Masala Munch', '', 90, 'g', 'Snacks & Biscuits', '🌶️', 20, 60, ['namkeen', 'snack']],
  ['haldirams-aloo-bhujia-400g', "Haldiram's", 'Aloo Bhujia', '', 400, 'g', 'Snacks & Biscuits', '🥨', 110, 65, ['namkeen', 'snack']],
  ['maggi-masala-noodles-280g', 'Maggi', 'Masala Instant Noodles', '', 280, 'g', 'Snacks & Biscuits', '🍜', 60, 80],

  // Breakfast
  ['kelloggs-corn-flakes-475g', "Kellogg's", 'Original Corn Flakes', '', 475, 'g', 'Breakfast', '🥣', 210, 55, ['cereal', 'cornflakes']],
  ['quaker-oats-1kg', 'Quaker', 'Rolled Oats', '', 1000, 'g', 'Breakfast', '🥣', 199, 50, ['oatmeal']],
  ['kissan-mixed-fruit-jam-500g', 'Kissan', 'Mixed Fruit Jam', '', 500, 'g', 'Breakfast', '🍓', 165, 50],

  // Household
  ['surf-excel-easy-wash-1kg', 'Surf Excel', 'Easy Wash Detergent Powder', '', 1000, 'g', 'Household', '🧺', 140, 65, ['washing', 'detergent']],
  ['vim-dishwash-gel-500ml', 'Vim', 'Lemon Dishwash Gel', '', 500, 'ml', 'Household', '🍋', 115, 55, ['dish', 'bartan', 'utensil']],
  ['harpic-toilet-cleaner-500ml', 'Harpic', 'Power Plus Toilet Cleaner', '', 500, 'ml', 'Household', '🧽', 105, 45],
  ['lizol-floor-cleaner-500ml', 'Lizol', 'Citrus Floor Cleaner', '', 500, 'ml', 'Household', '🧽', 119, 40, ['disinfectant']],

  // Personal Care
  ['dove-cream-bar-4x100g', 'Dove', 'Cream Beauty Bathing Bar', '', 100, 'g', 'Personal Care', '🧼', 250, 55, ['soap'], 4],
  ['colgate-strong-teeth-200g', 'Colgate', 'Strong Teeth Toothpaste', '', 200, 'g', 'Personal Care', '🪥', 120, 60, ['paste']],
  ['dettol-handwash-200ml', 'Dettol', 'Original Liquid Handwash', '', 200, 'ml', 'Personal Care', '🧴', 99, 45, ['soap', 'hand wash']],
  ['clinic-plus-shampoo-340ml', 'Clinic Plus', 'Strong & Long Shampoo', '', 340, 'ml', 'Personal Care', '🧴', 210, 45],
];

export const DEMO_CATALOG: CatalogProduct[] = ROWS.map(
  ([id, brand, name, variant, size, unit, category, emoji, mrp, popularity, keywords = [], packCount = 1]) => ({
    id,
    brand,
    name,
    variant,
    size: { value: size, unit },
    packCount,
    category,
    emoji,
    mrp,
    popularity,
    keywords,
  }),
);

export const DEMO_CATALOG_BY_ID = new Map(DEMO_CATALOG.map((p) => [p.id, p]));

/** "Amul Taaza Toned Milk" (brand + name), used for searching on platforms. */
export function productTitle(p: Pick<CatalogProduct, 'brand' | 'name' | 'variant'>): string {
  return [p.brand, p.name, p.variant].filter(Boolean).join(' ');
}

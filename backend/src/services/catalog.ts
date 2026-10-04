import { randomUUID } from 'node:crypto';
import type { CatalogProduct, CreateCartRequest, ResolvedCartItem } from '@savesmart/shared';
import { parseLine, parseShoppingList, resolveLine, searchCatalog, sizeFromManual, type ParsedLine } from '@savesmart/product-matching';

/** SaveSmart's canonical catalog: search and shopping-list resolution. */
export class CatalogService {
  private byId: Map<string, CatalogProduct>;

  constructor(private readonly products: CatalogProduct[]) {
    this.byId = new Map(products.map((p) => [p.id, p]));
  }

  all(): CatalogProduct[] {
    return this.products;
  }

  get(id: string): CatalogProduct | undefined {
    return this.byId.get(id);
  }

  search(query: string, limit = 12): CatalogProduct[] {
    return searchCatalog(query, this.products, limit).map((h) => h.product);
  }

  /** Builds cart items from a pasted list and/or structured entries (search picks, manual entry). */
  resolveCart(req: CreateCartRequest): ResolvedCartItem[] {
    const lines: { parsed: ParsedLine; productId?: string }[] = [];
    if (req.text) for (const parsed of parseShoppingList(req.text)) lines.push({ parsed });
    for (const e of req.entries ?? []) {
      const parsed = parseLine(e.query);
      if (e.quantity) {
        parsed.quantity = e.quantity;
        parsed.bareNumber = false;
      }
      const manualSize = e.unit ? sizeFromManual(e.quantity ?? 1, e.unit) : null;
      if (manualSize && manualSize.unit !== 'pcs') {
        // "Rice, 5, kg" means one 5 kg pack.
        parsed.size = manualSize;
        parsed.quantity = 1;
      }
      lines.push({ parsed, productId: e.productId });
    }

    return lines.map(({ parsed, productId }) => {
      const picked = productId ? this.byId.get(productId) : undefined;
      if (picked) {
        return { id: randomUUID(), query: parsed.raw, product: picked, quantity: parsed.quantity, confidence: 'high', alternatives: [] };
      }
      const r = resolveLine(parsed, this.products);
      return {
        id: randomUUID(),
        query: parsed.raw,
        product: r.product,
        quantity: r.quantity,
        confidence: r.confidence,
        alternatives: r.alternatives,
        note: r.note,
      };
    });
  }
}

import { useSyncExternalStore } from 'react';
import { priceBook } from './priceBook';

let version = 0;
priceBook.subscribe(() => version++);

/** A number that changes whenever the price book changes; use it as an effect dependency. */
export function usePriceBookVersion() {
  return useSyncExternalStore(priceBook.subscribe, () => version);
}

/** The price book, re-rendering the component when it changes. */
export function usePriceBook() {
  usePriceBookVersion();
  return priceBook;
}

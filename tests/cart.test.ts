import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  readCart,
  writeCart,
  cartAdditions,
  clearPurchased,
  addPiece,
} from '../src/client/cart';
const first = '00000000-0000-4000-8000-000000000001',
  second = '00000000-0000-4000-8000-000000000002';
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
it('retains migration messages until the cart consumes them even when the header reads first', () => {
  localStorage.setItem('good-apollo-cart', '[]');
  readCart();
  expect(readCart(true).message).toContain('old preview');
  expect(readCart(true).message).toBeUndefined();
});
it('clears only purchased quantities while preserving later same-variant and other additions', () => {
  writeCart([{ variantId: first, quantity: 2 }]);
  localStorage.setItem(
    'gag-purchased-carts',
    JSON.stringify({
      capability: { lines: readCart().lines, baseline: cartAdditions() },
    }),
  );
  addPiece(first);
  addPiece(second);
  clearPurchased('capability', [{ variantId: first, quantity: 2 }]);
  expect(readCart().lines).toEqual([
    { variantId: first, quantity: 1 },
    { variantId: second, quantity: 1 },
  ]);
  clearPurchased('capability', [{ variantId: first, quantity: 2 }]);
  expect(readCart().lines[0].quantity).toBe(1);
});
it('rejects corrupt quantities and never accepts stored prices as cart authority', () => {
  localStorage.setItem(
    'good-apollo-cart',
    JSON.stringify({
      version: 2,
      lines: [{ variantId: first, quantity: 1, price: 0, name: '<img>' }],
    }),
  );
  expect(readCart().lines).toEqual([{ variantId: first, quantity: 1 }]);
  localStorage.setItem(
    'good-apollo-cart',
    JSON.stringify({ version: 2, lines: [{ variantId: first, quantity: 0 }] }),
  );
  expect(readCart(true).message).toContain('could not be read');
});

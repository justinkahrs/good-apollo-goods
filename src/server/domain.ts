import { z } from 'zod';
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'invalid',
    public details?: {
      fields?: Array<{ path: string; message: string }>;
      current?: unknown;
    },
  ) {
    super(message);
  }
}
export const quantity = z.number().int().min(1).max(10);
export const cartSchema = z
  .array(z.object({ variantId: z.uuid(), quantity }))
  .min(1)
  .max(20);
export type CartLine = z.infer<typeof cartSchema>[number];
export function normalizeCart(input: unknown): CartLine[] {
  const parsed = cartSchema.parse(input);
  const quantities = new Map<string, number>();
  for (const line of parsed)
    quantities.set(
      line.variantId,
      (quantities.get(line.variantId) ?? 0) + line.quantity,
    );
  const lines = [...quantities]
    .map(([variantId, n]) => ({ variantId, quantity: quantity.parse(n) }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId));
  if (lines.reduce((n, l) => n + l.quantity, 0) > 30)
    throw new DomainError('Please order at most 30 pieces at a time.');
  return lines;
}
export function cents(input: string, allowZero = false) {
  if (!/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/.test(input.trim()))
    throw new DomainError('Enter dollars with at most two decimal places.');
  const [dollars, fraction = ''] = input.trim().split('.');
  const result = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  if (result < (allowZero ? 0 : 1))
    throw new DomainError('Price must be greater than zero.');
  return result;
}
export const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    n / 100,
  );
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function total(
  subtotal: number,
  shipping: number,
  tax: number,
  discount = 0,
) {
  const parts = [subtotal, shipping, tax, discount];
  if (parts.some((v) => !Number.isSafeInteger(v) || v < 0))
    throw new DomainError('Invalid financial totals.');
  const n = subtotal + shipping + tax - discount;
  if (!Number.isSafeInteger(n) || n < 0)
    throw new DomainError('Invalid financial totals.');
  return n;
}

export type CartLine = { variantId: string; quantity: number };
const KEY = 'good-apollo-cart';
export function readCart(consumeNotice = false): {
  lines: CartLine[];
  message?: string;
} {
  const notice = (message?: string) => {
    if (message) sessionStorage.setItem('gag-cart-notice', message);
    const saved = sessionStorage.getItem('gag-cart-notice') ?? undefined;
    if (consumeNotice) sessionStorage.removeItem('gag-cart-notice');
    return saved;
  };
  try {
    const stored = JSON.parse(
      localStorage.getItem(KEY) ?? '{"version":2,"lines":[]}',
    );
    if (Array.isArray(stored)) {
      localStorage.removeItem(KEY);
      return {
        lines: [],
        message: notice(
          'Your old preview cart was cleared. Please choose current pieces and variants again.',
        ),
      };
    }
    if (
      stored.version !== 2 ||
      !Array.isArray(stored.lines) ||
      stored.lines.length > 20
    )
      throw new Error();
    const ids = new Set<string>();
    for (const l of stored.lines) {
      if (
        !/^[a-f0-9-]{36}$/i.test(l.variantId) ||
        !Number.isInteger(l.quantity) ||
        l.quantity < 1 ||
        l.quantity > 10 ||
        ids.has(l.variantId)
      )
        throw new Error();
      ids.add(l.variantId);
    }
    if (
      stored.lines.reduce((sum: number, l: CartLine) => sum + l.quantity, 0) >
      30
    )
      throw new Error();
    return {
      message: notice(),
      lines: stored.lines.map((l: CartLine) => ({
        variantId: l.variantId,
        quantity: l.quantity,
      })),
    };
  } catch {
    localStorage.removeItem(KEY);
    return {
      lines: [],
      message: notice(
        'Your saved cart could not be read. Please add your pieces again.',
      ),
    };
  }
}
export function cartAdditions(): Record<string, number> {
  try {
    const entries = Object.entries(
      JSON.parse(localStorage.getItem('gag-cart-additions') ?? '{}'),
    );
    if (
      entries.length > 200 ||
      entries.some(
        ([id, n]) =>
          !/^[a-f0-9-]{36}$/i.test(id) ||
          !Number.isSafeInteger(n) ||
          Number(n) < 0,
      )
    )
      return {};
    return Object.fromEntries(entries) as Record<string, number>;
  } catch {
    return {};
  }
}
export function writeCart(lines: CartLine[]) {
  const previous = readCart().lines,
    adds = cartAdditions();
  for (const line of lines) {
    const increase =
      line.quantity -
      (previous.find((l) => l.variantId === line.variantId)?.quantity ?? 0);
    if (increase > 0)
      adds[line.variantId] = (adds[line.variantId] ?? 0) + increase;
  }
  localStorage.setItem('gag-cart-additions', JSON.stringify(adds));
  localStorage.setItem(KEY, JSON.stringify({ version: 2, lines }));
  window.dispatchEvent(new Event('good-apollo:cart-updated'));
}
export function clearPurchased(token: string, purchased: CartLine[]) {
  let attempts: Record<
    string,
    { lines: CartLine[]; baseline: Record<string, number>; cleared?: boolean }
  >;
  try {
    attempts = JSON.parse(localStorage.getItem('gag-purchased-carts') ?? '{}');
  } catch {
    return;
  }
  const attempt = attempts[token];
  if (
    !attempt ||
    attempt.cleared ||
    !Array.isArray(attempt.lines) ||
    !attempt.baseline
  )
    return;
  const adds = cartAdditions(),
    cart = readCart().lines;
  const next = cart
    .map((line) => {
      const bought =
        purchased.find((p) => p.variantId === line.variantId)?.quantity ?? 0;
      const later = Math.max(
        0,
        (adds[line.variantId] ?? 0) - (attempt.baseline[line.variantId] ?? 0),
      );
      return {
        ...line,
        quantity:
          line.quantity - Math.min(bought, Math.max(0, line.quantity - later)),
      };
    })
    .filter((l) => l.quantity > 0);
  attempt.cleared = true;
  localStorage.setItem('gag-purchased-carts', JSON.stringify(attempts));
  writeCart(next);
}
export function addPiece(variantId: string) {
  const { lines } = readCart();
  if (lines.reduce((sum, l) => sum + l.quantity, 0) >= 30)
    throw new Error('Your cart can hold up to 30 pieces.');
  const existing = lines.find((l) => l.variantId === variantId);
  if (existing) {
    if (existing.quantity >= 10)
      throw new Error('You can add up to 10 of each variant.');
    existing.quantity++;
  } else {
    if (lines.length >= 20)
      throw new Error('Your cart can hold up to 20 variants.');
    lines.push({ variantId, quantity: 1 });
  }
  writeCart(lines);
}
export async function post<T = Record<string, unknown>>(
  url: string,
  data: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const v = await r.json().catch(() => ({
    error: 'This action is unavailable. Refresh and try again.',
  }));
  if (!r.ok)
    throw Object.assign(new Error(v.error ?? 'Please try again shortly.'), {
      code: v.code,
      status: r.status,
      fields: v.fields,
      current: v.current,
    });
  return v;
}

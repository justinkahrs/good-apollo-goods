import { action, status, recoverForm, persistentOperation } from './admin';
type Balance = { revision: number; unsoldQty: number; heldQty: number };
export function showBalance(form: HTMLFormElement, balance: Balance) {
  Object.assign(form.dataset, {
    revision: String(balance.revision),
    unsold: String(balance.unsoldQty),
    held: String(balance.heldQty),
  });
  const card =
    form.closest('.studio-stock-card') ?? form.closest('[data-stock-card]')!;
  const state =
    form.dataset.active === 'false'
      ? 'Inactive'
      : balance.unsoldQty - balance.heldQty === 0
        ? 'Sold out'
        : balance.unsoldQty - balance.heldQty <=
            Number(form.dataset.threshold ?? 3)
          ? 'Low stock'
          : 'In stock';
  const pill = card.querySelector<HTMLElement>('.studio-pill');
  if (pill) {
    pill.textContent = state;
    pill.dataset.state = state;
  }
  const label = card.querySelector('[data-balances]');
  if (label)
    label.textContent = `${balance.unsoldQty} unsold · ${balance.heldQty} held · ${balance.unsoldQty - balance.heldQty} available`;
  card
    .querySelectorAll('[data-available]')
    .forEach(
      (e) => (e.textContent = String(balance.unsoldQty - balance.heldQty)),
    );
  card
    .querySelectorAll('[data-unsold-count]')
    .forEach((e) => (e.textContent = String(balance.unsoldQty)));
  card
    .querySelectorAll('[data-held-count]')
    .forEach((e) => (e.textContent = String(balance.heldQty)));
}
export function bindStock(form: HTMLFormElement) {
  if (form.dataset.bound) return;
  form.dataset.bound = 'true';
  const key = 'gag-stock:' + form.dataset.variantId,
    clear = recoverForm(form, key, true),
    operation = persistentOperation(key);
  const preview = () => {
    const d = new FormData(form),
      n = Number(d.get('quantity')),
      u = Number(form.dataset.unsold),
      h = Number(form.dataset.held),
      next =
        d.get('mode') === 'set'
          ? n
          : d.get('mode') === 'remove'
            ? u - n
            : u + n;
    form.querySelector('[data-preview]')!.textContent =
      `After this change: ${next} unsold, ${h} held, ${next - h} available.`;
  };
  form.addEventListener('input', preview);
  form.addEventListener('recovered', preview);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const entries = Object.fromEntries(new FormData(form)),
      s = form.querySelector('[data-status]')!,
      b = form.querySelector<HTMLButtonElement>('[type=submit]')!;
    b.disabled = true;
    try {
      const payload = {
        ...entries,
        variantId: form.dataset.variantId,
        revision: Number(form.dataset.revision),
        quantity: Number(entries.quantity),
      };
      const prior = operation.pending();
      const balance = await action<Balance>('stock.adjust', {
        ...payload,
        ...(prior?.data ?? {}),
        operationKey:
          prior?.id ??
          operation.get(payload, { ...payload, revision: undefined }),
      });
      operation.clear();
      showBalance(form, balance);
      const current = Object.fromEntries(new FormData(form));
      const recorded = (prior?.data ?? payload) as {
        mode: unknown;
        quantity: number;
        reason: unknown;
      };
      if (
        current.mode === recorded.mode &&
        Number(current.quantity) === recorded.quantity &&
        current.reason === recorded.reason
      ) {
        clear();
        form.reset();
      }
      status(s, 'Stock change recorded.');
      preview();
      window.dispatchEvent(new Event('gag:stock-saved'));
    } catch (error) {
      operation.rejected(error);
      status(s, (error as Error).message, error as Error);
      if ((error as { code?: string }).code === 'revision') {
        const current = (error as { current?: Balance }).current;
        if (current) showBalance(form, current);
      }
    } finally {
      b.disabled = false;
    }
  });
}
document.querySelectorAll<HTMLFormElement>('[data-stock]').forEach(bindStock);

import { action, status, persistentOperation } from './admin';
import { bindStock, showBalance } from './stock-editor';
type Variant = {
  id?: string;
  initialQuantity?: number;
  clientId?: string;
  label: string;
  sku: string;
  priceCents: number;
  price?: string;
  active: boolean;
  lowStockThreshold: number;
  options: Record<string, string>;
};
const form = document.querySelector<HTMLFormElement>('[data-product]')!,
  defaults = JSON.parse(form.dataset.product!),
  root = form.querySelector('[data-variants]')!,
  template = document.querySelector<HTMLTemplateElement>('#variant-template')!,
  singleProduct = form.querySelector<HTMLElement>('[data-single-product]')!,
  singlePrice = form.querySelector<HTMLInputElement>('[data-single-price]')!,
  variantSettings = form.querySelector<HTMLDetailsElement>(
    '[data-variant-settings]',
  )!;
function field(row: Element, name: string) {
  return row.querySelector<HTMLInputElement>('[data-field="' + name + '"]')!;
}
function addRow(v: Variant) {
  const fragment = template.content.cloneNode(true) as DocumentFragment,
    row = fragment.querySelector<HTMLElement>('[data-variant]')!;
  if (v.id) row.dataset.id = v.id;
  row.dataset.clientId = v.id ?? v.clientId ?? crypto.randomUUID();
  field(row, 'initialQuantity').value = String(v.initialQuantity ?? 0);
  (row.querySelector('[data-initial-label]') as HTMLElement).hidden = Boolean(
    v.id,
  );
  field(row, 'label').value = v.label;
  field(row, 'price').value =
    v.price ?? (v.priceCents > 0 ? (v.priceCents / 100).toFixed(2) : '');
  field(row, 'sku').value = v.sku;
  field(row, 'active').checked = v.active;
  field(row, 'threshold').value = String(v.lowStockThreshold);
  row.querySelector('[data-variant-heading]')!.textContent = v.label;
  Object.entries(v.options).forEach(([key, value], i) => {
    field(row, 'key' + (i + 1)).value = key;
    field(row, 'value' + (i + 1)).value = value;
  });
  row.querySelector('[data-remove-variant]')!.addEventListener('click', () => {
    row.remove();
    sync();
  });
  root.append(fragment);
}
function serialize() {
  return [...root.querySelectorAll<HTMLElement>('[data-variant]')].map(
    (row) => {
      const options: Record<string, string> = {};
      for (const n of [1, 2]) {
        const k = field(row, 'key' + n).value.trim(),
          v = field(row, 'value' + n).value.trim();
        if (k && v) options[k] = v;
      }
      return {
        id: row.dataset.id,
        clientId: row.dataset.id ?? row.dataset.clientId,
        initialQuantity: Number(field(row, 'initialQuantity').value),
        label: field(row, 'label').value,
        sku: field(row, 'sku').value,
        price: field(row, 'price').value,
        options,
        active: field(row, 'active').checked,
        lowStockThreshold: Number(field(row, 'threshold').value),
      };
    },
  );
}
function sync() {
  (form.querySelector('[data-variants-json]') as HTMLInputElement).value =
    JSON.stringify(serialize());
  presentation();
  form.dispatchEvent(new Event('input'));
}
function presentation() {
  const rows = [...root.querySelectorAll<HTMLElement>('[data-variant]')],
    variants = serialize(),
    single =
      variants.length === 1 && Object.keys(variants[0].options).length === 0;
  singleProduct.hidden = !single;
  singlePrice.disabled = !single;
  singlePrice.required = single;
  (form.querySelector('[data-multiple-price]') as HTMLElement).hidden = single;
  (form.querySelector('[data-single-initial]') as HTMLElement).hidden =
    !single || Boolean(defaults.id);
  if (single) {
    singlePrice.value = field(rows[0], 'price').value;
    (form.querySelector('[data-initial-single]') as HTMLInputElement).value =
      field(rows[0], 'initialQuantity').value;
  }
  for (const row of rows) {
    field(row, 'price').required = !single;
    row.querySelector('[data-variant-heading]')!.textContent =
      field(row, 'label').value || 'Variant';
  }
  form.querySelector('[data-variant-summary]')!.textContent = single
    ? 'Optional choices, each with its own price and stock.'
    : `${variants.length} option${variants.length === 1 ? '' : 's'} · edit prices and stock alerts`;
}
for (const v of defaults.variants.length
  ? defaults.variants
  : [
      {
        label: 'As described',
        sku: '',
        priceCents: 0,
        active: true,
        lowStockThreshold: 3,
        options: {},
      },
    ])
  addRow(v);
sync();
root.addEventListener('input', () => {
  (form.querySelector('[data-variants-json]') as HTMLInputElement).value =
    JSON.stringify(serialize());
  presentation();
});
singlePrice.addEventListener('input', () => {
  const row = root.querySelector('[data-variant]');
  if (row) field(row, 'price').value = singlePrice.value;
  (form.querySelector('[data-variants-json]') as HTMLInputElement).value =
    JSON.stringify(serialize());
});
form.querySelector('[data-open-variants]')!.addEventListener('click', () => {
  variantSettings.open = true;
  variantSettings.querySelector('summary')!.focus();
});
// Reveal the optional section containing an invalid control before the browser
// focuses it, so folded advanced fields never silently block saving.
form.addEventListener(
  'invalid',
  (event) => {
    let parent = (event.target as HTMLElement).parentElement;
    while (parent && parent !== form) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
  },
  true,
);
form.querySelector('[name=name]')!.addEventListener('input', () => {
  const slug = form.querySelector<HTMLInputElement>('[name=slug]')!;
  if (!defaults.id)
    slug.value = (form.querySelector('[name=name]') as HTMLInputElement).value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 120)
      .replace(/^-|-$/g, '');
  form.dispatchEvent(new Event('input'));
});
form.querySelector('[data-add-variant]')!.addEventListener('click', () => {
  addRow({
    label: 'New variant',
    sku: '',
    priceCents: 0,
    active: true,
    lowStockThreshold: 3,
    options: {},
  });
  variantSettings.open = true;
  root.lastElementChild!.querySelector('details')!.open = true;
  sync();
});
form.querySelector('[data-generate]')!.addEventListener('click', () => {
  const names = [1, 2].map((n) =>
      (
        form.querySelector('[data-option-name="' + n + '"]') as HTMLInputElement
      ).value.trim(),
    ),
    values = [1, 2].map((n) =>
      (
        form.querySelector(
          '[data-option-values="' + n + '"]',
        ) as HTMLInputElement
      ).value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    );
  const s = form.querySelector('[data-product-status]')!;
  if (
    !names[0] ||
    !values[0].length ||
    (names[1] && !values[1].length) ||
    names[0] === names[1]
  ) {
    status(s, 'Add distinct option names and their values.');
    return;
  }
  if (values[0].length * Math.max(1, values[1].length) > 100) {
    status(s, 'Use at most 100 variants.');
    return;
  }
  const existing = serialize();
  if (
    existing.some((v) => v.id) &&
    !window.confirm(
      'Regenerate options? Matching options keep their stock; omitted options become inactive when you save.',
    )
  )
    return;
  root.replaceChildren();
  for (const a of values[0])
    for (const b of names[1] ? values[1] : ['']) {
      const options = { [names[0]]: a, ...(names[1] ? { [names[1]]: b } : {}) };
      const old = existing.find(
        (v) =>
          JSON.stringify(Object.entries(v.options).sort()) ===
          JSON.stringify(Object.entries(options).sort()),
      );
      addRow({
        id: old?.id,
        label: old?.label ?? [a, b].filter(Boolean).join(' / '),
        sku: old?.sku ?? '',
        priceCents: 0,
        price:
          old?.price ??
          ((form.querySelector('[data-default-price]') as HTMLInputElement)
            .value ||
            singlePrice.value),
        active: old?.active ?? true,
        lowStockThreshold: old?.lowStockThreshold ?? 3,
        options,
      });
    }
  sync();
});

// The editor owns one structured, versioned draft. Server revisions never come
// from restored controls. Files stay in memory and are explicitly reselected.
type Photo = {
  id: string;
  alt: string;
  altSource?: string;
  variantId: string | null;
  archivedAt?: string | null;
  verified?: boolean;
  placeholder?: boolean;
};
type Product = {
  id: string;
  revision: number;
  name: string;
  slug: string;
  status: string;
  deletedAt?: string | null;
  variants: Array<
    Variant & {
      id: string;
      stock: { revision: number; unsoldQty: number; heldQty: number } | null;
    }
  >;
  images: Photo[];
} & Record<string, unknown>;
type Draft = {
  details: Record<string, string>;
  variants: ReturnType<typeof serialize>;
  images: Array<{
    id: string;
    alt: string;
    altSource: string;
    variantId: string | null;
    hidden: boolean;
  }>;
};
const photos = document.querySelector<HTMLElement>('[data-photos]')!,
  list = photos.querySelector<HTMLOListElement>('.photo-list')!,
  photoForm = photos.querySelector<HTMLFormElement>('form')!;
const productStatus = form.querySelector('[data-product-status]')!,
  photoStatus = photos.querySelector('[data-photo-status]')!,
  notice = document.querySelector('[data-draft-notice]')!,
  conflicts = document.querySelector('[data-conflicts]')!;
const persistence = document.querySelector('[data-persistence-state]')!;
let product: Product | undefined = defaults.id ? defaults : undefined,
  base: Draft,
  recovering = false,
  chain = Promise.resolve(),
  pending = 0,
  queue: Upload[] = [];
const operation = persistentOperation('editor:' + (defaults.id ?? 'new'));
let recoveredUploads: Array<
  Pick<Upload, 'id' | 'name' | 'size' | 'type' | 'intent'>
> = [];
let draftKey = 'gag-editor:' + (defaults.id ?? 'new');
function ordered(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordered);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, ordered(x)]),
    );
  return v;
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
function photoState(): Draft['images'] {
  return [...list.querySelectorAll<HTMLElement>('[data-photo-id]')].map(
    (row) => ({
      id: row.dataset.photoId!,
      alt: (row.querySelector('[data-alt]') as HTMLInputElement).value,
      altSource: (
        row.querySelector('[data-alt]') as HTMLInputElement
      ).value.trim()
        ? 'custom'
        : 'generated',
      variantId:
        (row.querySelector('select') as HTMLSelectElement).value || null,
      hidden: row.dataset.archived === 'true',
    }),
  );
}
function capture(): Draft {
  const details = Object.fromEntries(
    [...new FormData(form)].filter(
      ([k, v]) =>
        !['id', 'revision', 'variants'].includes(k) && typeof v === 'string',
    ),
  ) as Record<string, string>;
  return { details, variants: serialize(), images: photoState() };
}
function canonical(p: Product): Draft {
  const details: Record<string, string> = {};
  for (const key of Object.keys(base?.details ?? capture().details))
    details[key] = String(p[key] ?? '');
  return {
    details,
    variants: p.variants.map((v) => ({
      id: v.id,
      clientId:
        ([...root.children] as HTMLElement[]).find((r) => r.dataset.id === v.id)
          ?.dataset.clientId ?? v.id,
      label: v.label,
      sku: v.sku,
      price: (v.priceCents / 100).toFixed(2),
      initialQuantity: 0,
      options: v.options,
      active: v.active,
      lowStockThreshold: v.lowStockThreshold,
    })),
    images: p.images.map((i) => ({
      id: i.id,
      alt: i.altSource === 'generated' ? '' : i.alt,
      altSource: i.altSource ?? 'custom',
      variantId: i.variantId,
      hidden: Boolean(i.archivedAt),
    })),
  };
}
function captureTools() {
  return [
    ...form.querySelectorAll<HTMLInputElement>(
      '[data-option-name],[data-option-values],[data-default-price]',
    ),
  ].map((e) => e.value);
}
function restoreTools(values: string[]) {
  [
    ...form.querySelectorAll<HTMLInputElement>(
      '[data-option-name],[data-option-values],[data-default-price]',
    ),
  ].forEach((e, i) => {
    if (values[i] !== undefined) e.value = values[i];
  });
}
function writeStored() {
  if (recovering) return;
  const value = {
    version: 1,
    base,
    draft: capture(),
    tools: captureTools(),
    hadFiles: queue.some((q) => q.state !== 'done'),
    uploads: queue
      .filter((q) => q.state !== 'done')
      .map((q) => ({
        id: q.id,
        name: q.name,
        size: q.size,
        type: q.type,
        intent: q.intent,
      })),
  };
  try {
    sessionStorage.setItem(draftKey, JSON.stringify(value));
  } catch {
    notice.textContent =
      'Browser recovery storage is unavailable. Keep this tab open until changes are saved.';
  }
  persistence.textContent = equal(capture(), base)
    ? 'Saved'
    : 'Unsaved changes';
}
function labels() {
  let cover = false;
  for (const row of [...list.children] as HTMLElement[]) {
    const visible = row.dataset.archived !== 'true';
    row.querySelector('[data-cover-label]')!.textContent = visible
      ? !cover
        ? 'Cover'
        : 'Visible in shop when published'
      : 'Hidden from shop';
    const button = row.querySelector('[data-toggle-visibility]');
    if (button) button.textContent = visible ? 'Hide photo' : 'Show photo';
    if (visible) cover = true;
  }
}
function appendPhoto(i: Photo) {
  if (list.querySelector(`[data-photo-id="${i.id}"]`)) return;
  const template =
      document.querySelector<HTMLTemplateElement>('#photo-template')!,
    fragment = template.content.cloneNode(true) as DocumentFragment,
    row = fragment.querySelector<HTMLElement>('li')!;
  row.dataset.photoId = i.id;
  row.dataset.archived = String(Boolean(i.archivedAt));
  const img = row.querySelector('img')!;
  img.src = `/media/${i.id}/400/`;
  img.alt = i.alt || product?.name || 'Product photo';
  const input = row.querySelector<HTMLInputElement>('[data-alt]')!;
  input.value = i.altSource === 'generated' ? '' : i.alt;
  input.placeholder = product?.name || 'Product photo';
  list.append(fragment);
}
function associations() {
  for (const row of list.querySelectorAll<HTMLElement>('[data-photo-id]')) {
    const select = row.querySelector('select')!,
      value = select.value;
    select.replaceChildren(new Option('All variants', ''));
    for (const v of product?.variants ?? [])
      select.add(new Option(v.label, v.id));
    select.value = value;
    const label = select.closest('label')!;
    label.hidden =
      product?.variants.length === 1 &&
      Object.keys(product.variants[0].options).length === 0;
    const input = row.querySelector<HTMLInputElement>('[data-alt]')!;
    input.placeholder =
      (product?.name ?? 'Product photo') +
      (value
        ? ' — ' + (product?.variants.find((v) => v.id === value)?.label ?? '')
        : '');
    row
      .querySelector('img')
      ?.setAttribute('alt', input.value || input.placeholder);
  }
}
function renderSection(key: keyof Draft, value: Draft[keyof Draft]) {
  recovering = true;
  if (key === 'details') {
    for (const [name, text] of Object.entries(value as Draft['details'])) {
      const control = form.elements.namedItem(name) as HTMLInputElement | null;
      if (control) control.value = text;
    }
  }
  if (key === 'variants') {
    root.replaceChildren();
    for (const v of value as Draft['variants']) addRow({ ...v, priceCents: 0 });
    presentation();
  }
  if (key === 'images') {
    for (const i of value as Draft['images']) {
      let row = list.querySelector<HTMLElement>(`[data-photo-id="${i.id}"]`);
      if (!row) {
        const image = product?.images.find((x) => x.id === i.id);
        if (image) appendPhoto(image);
        row = list.querySelector<HTMLElement>(`[data-photo-id="${i.id}"]`);
      }
      if (!row) continue;
      (row.querySelector('[data-alt]') as HTMLInputElement).value = i.alt;
      (row.querySelector('select') as HTMLSelectElement).value =
        i.variantId ?? '';
      row.dataset.archived = String(i.hidden);
      list.append(row);
    }
    labels();
  }
  recovering = false;
}
function syncStock(p: Product) {
  const host = document.querySelector('[data-stock-host]')!;
  for (const v of p.variants) {
    let f = host.querySelector<HTMLFormElement>(`[data-variant-id="${v.id}"]`);
    if (!f) {
      const fragment = document
        .querySelector<HTMLTemplateElement>('#stock-template')!
        .content.cloneNode(true) as DocumentFragment;
      f = fragment.querySelector('form')!;
      f.dataset.variantId = v.id;
      fragment.querySelector('[data-stock-label]')!.textContent = v.label;
      fragment.querySelector<HTMLAnchorElement>('[data-history]')!.href =
        `/admin/history/?variant=${v.id}`;
      host.append(fragment);
      bindStock(f);
    }
    if (v.stock) showBalance(f, v.stock);
  }
}
function adopt(
  p: Product,
  submitted?: Draft,
  sections: Array<keyof Draft> = [],
) {
  const previous = product,
    local = capture();
  product = p;
  Object.assign(defaults, { id: p.id, revision: p.revision });
  (form.elements.namedItem('revision') as HTMLInputElement).value = String(
    p.revision,
  );
  photos.dataset.productId = p.id;
  photos.dataset.revision = String(p.revision);
  if (!previous) {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {}
    draftKey = 'gag-editor:' + p.id;
    history.replaceState(null, '', `/admin/products/${p.id}/`);
  }
  // Match newly created rows by their exact option identity before clearing initial counts.
  for (const row of root.querySelectorAll<HTMLElement>('[data-variant]')) {
    if (!row.dataset.id) {
      const variant = serialize().find(
          (v) => v.clientId === row.dataset.clientId,
        ),
        saved = p.variants.find((v) =>
          equal(
            Object.entries(v.options).sort(),
            Object.entries(variant?.options ?? {}).sort(),
          ),
        );
      if (saved) {
        row.dataset.id = saved.id;
        const v = local.variants.find(
          (v) => v.clientId === row.dataset.clientId,
        );
        if (v) {
          v.id = saved.id;
          v.clientId = saved.id;
        }
        const submittedVariant = submitted?.variants.find(
          (v) => v.clientId === row.dataset.clientId,
        );
        if (submittedVariant) {
          submittedVariant.id = saved.id;
          submittedVariant.clientId = saved.id;
        }
        row.dataset.clientId = saved.id;
      }
    }
  }
  const next = canonical(p);
  for (const key of sections) {
    if (submitted && equal(local[key], submitted[key]))
      renderSection(key, next[key]);
    base[key] = next[key] as never;
  }
  if (!sections.includes('images')) {
    for (const i of p.images) appendPhoto(i);
    for (const row of [...list.children] as HTMLElement[])
      if (!p.images.some((i) => i.id === row.dataset.photoId)) row.remove();
    base.images = next.images;
  }
  associations();
  labels();
  syncStock(p);
  document.querySelector('.editor-stock strong')!.textContent = String(
    p.variants
      .filter((v) => v.active)
      .reduce(
        (n, v) => n + (v.stock?.unsoldQty ?? 0) - (v.stock?.heldQty ?? 0),
        0,
      ),
  );
  const duplicate = document.querySelector<HTMLElement>('[data-duplicate]');
  if (duplicate) {
    duplicate.hidden = Boolean(p.deletedAt);
    duplicate.dataset.duplicate = p.id;
  }
  const title = document.querySelector('h1')!;
  title.textContent = p.name;
  document.querySelector('[data-editor-intro]')!.textContent =
    'Manage details, photos, stock and visibility here. Saved edits update the listing.';
  (document.querySelector('[data-stock-link]') as HTMLElement).hidden = false;
  (document.querySelector('[data-initial-hint]') as HTMLElement).hidden = true;
  document.querySelector('.editor-status')!.textContent = p.deletedAt
    ? 'In Trash'
    : p.status === 'published'
      ? 'In the shop'
      : p.status === 'archived'
        ? 'Archived'
        : 'Private draft';
  for (const [selector, hidden] of [
    ['[data-delete-listing]', !!p.deletedAt],
    ['[data-restore-listing]', !p.deletedAt],
    ['[data-purge-listing]', !p.deletedAt],
    ['[data-deleted-message]', !p.deletedAt],
  ] as const)
    (document.querySelector(selector) as HTMLElement).hidden = hidden;
  (form.querySelector('[data-single-initial]') as HTMLElement).hidden = true;
  writeStored();
}
async function serial<T>(run: () => Promise<T>): Promise<T> {
  pending++;
  const next = chain.then(async () => {
    await reconcileSave();
    return run();
  });
  chain = next.then(
    () => {},
    () => {},
  );
  try {
    return await next;
  } finally {
    pending--;
  }
}
function errors(root: Element, error: unknown) {
  status(root, (error as Error).message, error as Error);
  persistence.textContent = 'Save failed — entries retained';
  const fields =
    (error as { fields?: Array<{ path: string; message: string }> }).fields ??
    [];
  const ul = document.querySelector('[data-publication-issues]')!;
  ul.replaceChildren();
  for (const f of fields) {
    const li = document.createElement('li'),
      a = document.createElement('a');
    a.textContent = f.message;
    a.href = f.path === 'photos' ? '#photos' : '#' + f.path;
    a.onclick = (e) => {
      e.preventDefault();
      let el: HTMLElement | null = null;
      if (f.path === 'photos') el = photos;
      else if (f.path.startsWith('variants')) {
        variantSettings.open = true;
        const parts = f.path.split('.'),
          index = Number(parts[1]);
        const row = root.children[Number.isInteger(index) ? index : 0];
        const fieldName = [
          'price',
          'label',
          'sku',
          'initialQuantity',
          'active',
        ].includes(parts[2])
          ? parts[2]
          : 'label';
        el =
          row?.querySelector<HTMLElement>(`[data-field="${fieldName}"]`) ??
          variantSettings;
      } else {
        const control = form.elements.namedItem(f.path);
        if (control instanceof HTMLElement) el = control;
      }
      let parent = el?.parentElement;
      while (parent && parent !== form) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      el?.scrollIntoView();
      el?.focus();
    };
    li.append(a);
    ul.append(li);
  }
  if ((error as { code?: string }).code === 'revision') void refreshConflict();
}
async function refreshConflict() {
  if (!product) return;
  try {
    const latest = await action<Product>('product.get', { id: product.id });
    reviewDraft(capture(), base, latest);
  } catch (error) {
    status(productStatus, (error as Error).message, error as Error);
  }
}
function reviewDraft(local: Draft, oldBase: Draft, latest: Product) {
  const current = canonical(latest);
  product = latest;
  conflicts.replaceChildren();
  let unresolved = 0;
  const merged: Draft = structuredClone(current);
  const choose = (
    section: keyof Draft,
    key: string | undefined,
    ours: unknown,
    theirs: unknown,
    ancestor: unknown,
  ) => {
    const assign = (value: unknown) => {
      if (key) merged.details[key] = value as string;
      else merged[section] = value as never;
    };
    if (equal(ours, ancestor)) {
      assign(theirs);
      return;
    }
    if (equal(theirs, ancestor) || equal(ours, theirs)) {
      assign(ours);
      return;
    }
    unresolved++;
    const box = document.createElement('fieldset'),
      legend = document.createElement('legend');
    legend.textContent = 'Review ' + (key ?? section);
    box.append(legend);
    for (const [label, value] of [
      ['Keep my entries', ours],
      ['Use latest saved', theirs],
    ] as const) {
      const preview = document.createElement('pre');
      preview.textContent =
        typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      box.append(preview);
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.onclick = () => {
        assign(value);
        box.remove();
        unresolved--;
        if (!unresolved) finish();
      };
      box.append(b);
    }
    conflicts.append(box);
  };
  for (const key of new Set([
    ...Object.keys(local.details),
    ...Object.keys(current.details),
  ]))
    choose(
      'details',
      key,
      local.details[key],
      current.details[key],
      oldBase.details[key],
    );
  choose(
    'variants',
    undefined,
    local.variants,
    current.variants,
    oldBase.variants,
  );
  choose('images', undefined, local.images, current.images, oldBase.images);
  function finish() {
    base = current;
    adopt(latest);
    for (const section of ['details', 'variants', 'images'] as const)
      renderSection(section, merged[section]);
    operation.clear();
    notice.textContent =
      'Recovered entries reviewed against the latest saved version. Review and save when ready.';
    writeStored();
  }
  if (!unresolved) finish();
  else {
    notice.textContent =
      'Someone saved a newer version. Your entries are retained. Choose each conflicting value before saving.';
    conflicts.scrollIntoView();
  }
}
base = capture();
associations();
labels();
try {
  const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null');
  if (saved?.version === 1) {
    recoveredUploads = saved.uploads ?? [];
    restoreTools(saved.tools ?? []);
    if (product && !equal(saved.base, base))
      reviewDraft(saved.draft, saved.base, product);
    else {
      for (const key of ['details', 'variants', 'images'] as const)
        renderSection(key, saved.draft[key]);
      notice.textContent = 'Unsaved entries restored.';
    }
    if (saved.hadFiles)
      notice.append(' Reselect photos that were not uploaded.');
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.textContent = 'Discard recovered entries';
    discard.onclick = () => {
      for (const key of ['details', 'variants', 'images'] as const)
        renderSection(key, base[key]);
      conflicts.replaceChildren();
      notice.replaceChildren();
      writeStored();
    };
    notice.append(discard);
  }
} catch {
  notice.textContent =
    'Browser recovery could not be read. Current saved listing is loaded.';
}
form.addEventListener('input', writeStored);
photoForm.addEventListener('input', () => {
  labels();
  writeStored();
});
form.querySelector('[data-initial-single]')!.addEventListener('input', (e) => {
  const row = root.querySelector('[data-variant]');
  if (row)
    field(row, 'initialQuantity').value = (e.target as HTMLInputElement).value;
  writeStored();
});

async function reconcileSave() {
  const prior = operation.pending();
  if (!prior) return;
  const payload = prior.data as {
    action: string;
    id?: string;
    revision?: number;
    variants: Draft['variants'];
    images?: Draft['images'];
  } & Record<string, unknown>;
  const receipt = await action<{ result: Product | null }>('mutation.get', {
    id: prior.id,
  });
  let result = receipt.result;
  if (!result) {
    try {
      result = await action<Product>('product.save', {
        ...payload,
        operationKey: prior.id,
      });
    } catch (error) {
      operation.rejected(error);
      throw error;
    }
  }
  const submitted: Draft = {
    details: Object.fromEntries(
      Object.keys(base.details).map((k) => [k, String(payload[k] ?? '')]),
    ),
    variants: payload.variants,
    images: payload.images ?? [],
  };
  operation.clear();
  adopt(result, submitted, ['details', 'variants', 'images']);
  const latest = await action<Product>('product.get', { id: result.id });
  if (latest.revision !== result.revision) reviewDraft(capture(), base, latest);
  status(productStatus, 'Previous save confirmed. Entries kept.');
}
async function save(asDraft = false) {
  await reconcileSave();
  if (conflicts.children.length)
    throw new Error('Resolve the conflicting entries before saving.');
  const submitted = capture(),
    data = {
      ...submitted.details,
      id: product?.id,
      revision: product?.revision,
      variants: submitted.variants,
      images: product ? submitted.images : undefined,
      ...(asDraft ? { status: 'draft' } : {}),
    };
  persistence.textContent = 'Saving…';
  const payload = { action: 'product.save', ...data };
  try {
    const result = await action<Product>('product.save', {
      ...data,
      operationKey: operation.get(payload),
    });
    operation.clear();
    adopt(result, submitted, ['details', 'variants', 'images']);
    status(productStatus, 'Product saved.');
    document.querySelector('[data-publication-issues]')!.replaceChildren();
    await uploadWaiting();
  } catch (error) {
    operation.rejected(error);
    throw error;
  }
}
form.addEventListener('submit', (e) => {
  e.preventDefault();
  void serial(() => save()).catch((e) => errors(productStatus, e));
});
form.querySelector('[data-save-draft]')!.addEventListener('click', () => {
  if (form.reportValidity())
    void serial(() => save(true)).catch((e) => errors(productStatus, e));
});
document.querySelector('[data-duplicate]')?.addEventListener('click', () => {
  void serial(async () => {
    if (!product) return;
    if (
      !equal(capture(), base) &&
      !window.confirm(
        'Duplicate the saved listing? Your unsaved entries will remain recoverable here.',
      )
    )
      return;
    const key = persistentOperation('duplicate:' + product.id);
    const payload = { id: product.id };
    const result = await action<{ id: string }>('product.duplicate', {
      ...payload,
      operationKey: key.get(payload),
    });
    key.clear();
    location.assign(`/admin/products/${result.id}/`);
  }).catch((e) => errors(productStatus, e));
});
photoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void serial(async () => {
    if (!product) throw new Error('Save the draft first to upload photos.');
    const submitted = capture(),
      payload = {
        productId: product.id,
        revision: product.revision,
        images: submitted.images,
      };
    const key = persistentOperation('photos:' + product.id);
    try {
      const prior = key.pending();
      const replay = prior
        ? await action<{ result: Product | null }>('mutation.get', {
            id: prior.id,
          })
        : null;
      const next =
        replay?.result ??
        (await action<Product>('photo.save', {
          ...(prior?.data ?? payload),
          operationKey: prior?.id ?? key.get(payload),
        }));
      key.clear();
      adopt(
        next,
        prior
          ? {
              ...submitted,
              images: (prior.data as { images: Draft['images'] }).images,
            }
          : submitted,
        ['images'],
      );
      status(photoStatus, 'Photos saved. Product entries are unchanged.');
    } catch (e) {
      key.rejected(e);
      throw e;
    }
  }).catch((e) => errors(photoStatus, e));
});
list.addEventListener('click', (e) => {
  const target = e.target as HTMLElement,
    row = target.closest<HTMLElement>('[data-photo-id]');
  if (!row) return;
  if (target.matches('[data-delete]')) {
    if (
      !window.confirm('Delete this photo? Other entered changes will be kept.')
    )
      return;
    void serial(async () => {
      if (!product) return;
      const payload = {
          productId: product.id,
          imageId: row.dataset.photoId,
          revision: product.revision,
        },
        key = persistentOperation('delete-photo:' + row.dataset.photoId);
      try {
        const prior = key.pending();
        const replay = prior
          ? await action<{ result: Product | null }>('mutation.get', {
              id: prior.id,
            })
          : null;
        const next =
          replay?.result ??
          (await action<Product>('photo.delete', {
            ...(prior?.data ?? payload),
            operationKey: prior?.id ?? key.get(payload),
          }));
        key.clear();
        row.remove();
        adopt(next);
        status(photoStatus, 'Photo deleted. Other edits are kept.');
      } catch (e) {
        key.rejected(e);
        throw e;
      }
    }).catch((e) => errors(photoStatus, e));
    return;
  }
  if (target.matches('[data-toggle-visibility]'))
    row.dataset.archived = String(row.dataset.archived !== 'true');
  if (target.matches('[data-up]') && row.previousElementSibling)
    list.insertBefore(row, row.previousElementSibling);
  if (target.matches('[data-down]') && row.nextElementSibling)
    list.insertBefore(row.nextElementSibling, row);
  if (target.matches('[data-cover]')) {
    if (row.dataset.archived === 'true') {
      status(photoStatus, 'Choose Show photo before making it the cover.');
      return;
    }
    list.prepend(row);
  }
  labels();
  writeStored();
});
type Upload = {
  id: string;
  file?: File;
  name: string;
  size: number;
  type: string;
  state: 'waiting' | 'uploading' | 'failed' | 'done';
  intent?: { id: string; url: string };
  row: HTMLElement;
};
const uploadInput = photos.querySelector<HTMLInputElement>('[data-upload]')!,
  uploadStatus = photos.querySelector('[data-upload-status]')!;
function uploadLabel(item: Upload, text: string) {
  item.row.querySelector('span')!.textContent = `${item.name}: ${text}`;
  if (item.state === 'done') {
    item.row.querySelector('img')?.remove();
    item.row
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((b) => (b.hidden = true));
  }
  uploadActivity();
}
function uploadActivity() {
  const active = queue.filter((q) => q.state !== 'done').length;
  (photos.querySelector('[data-upload-history]') as HTMLDetailsElement).open =
    active > 0;
  photos.querySelector('[data-upload-summary]')!.textContent = active
    ? `${active} photo${active === 1 ? '' : 's'} pending`
    : `${queue.length} photo${queue.length === 1 ? '' : 's'} added`;
  if (!active)
    status(uploadStatus, 'All selected photos are verified and saved.');
}
async function uploadOne(item: Upload) {
  if (!product || !item.file) return;
  item.state = 'uploading';
  item.row
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((b) => (b.disabled = true));
  uploadLabel(item, 'Uploading…');
  try {
    const file = item.file;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new Error(
        'Export HEIC or other unsupported photos as JPEG, PNG or WebP.',
      );
    if (file.size > 10 * 1024 * 1024)
      throw new Error('Photo must be 10 MB or smaller.');
    const key = persistentOperation('upload:' + item.id),
      payload = { productId: product.id, type: file.type, bytes: file.size };
    if (item.intent) {
      try {
        const prior = await action<{ image: Photo; product: Product }>(
          'photo.finalize',
          { id: item.intent.id },
        );
        adopt(prior.product);
        item.state = 'done';
        item.file = undefined;
        key.clear();
        uploadLabel(item, 'Verified and saved');
        item.row
          .querySelectorAll<HTMLButtonElement>('button')
          .forEach((b) => (b.hidden = true));
        writeStored();
        return;
      } catch (error) {
        if ((error as { code?: string }).code === 'upload_expired') {
          key.clear();
          item.intent = undefined;
        }
        if (
          ['signin', 'verify', 'deleted'].includes(
            (error as { code?: string }).code ?? '',
          )
        )
          throw error;
      }
    }
    item.intent ??= await action<{ id: string; url: string }>('photo.intent', {
      ...payload,
      operationKey: key.get(payload),
    });
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', item.intent!.url);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          uploadLabel(
            item,
            `Uploading ${Math.round((e.loaded / e.total) * 100)}%`,
          );
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error('Upload failed. Retry this photo.'));
      xhr.onerror = () =>
        reject(new Error('Connection lost. Retry this photo.'));
      xhr.send(file);
    });
    const result = await action<{ image: Photo; product: Product }>(
      'photo.finalize',
      { id: item.intent.id },
    );
    adopt(result.product);
    item.state = 'done';
    item.file = undefined;
    key.clear();
    uploadLabel(item, 'Verified and saved');
    item.row
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((b) => (b.hidden = true));
    writeStored();
  } catch (error) {
    item.state = 'failed';
    uploadLabel(item, (error as Error).message);
    const b = item.row.querySelector<HTMLButtonElement>('button')!;
    b.hidden = false;
    b.textContent = 'Retry photo';
    status(uploadStatus, (error as Error).message, error as Error);
    writeStored();
  } finally {
    item.row
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((b) => (b.disabled = false));
  }
}
async function uploadWaiting() {
  for (const item of queue) if (item.state === 'waiting') await uploadOne(item);
}
uploadInput.addEventListener('change', () => {
  for (const file of [...(uploadInput.files ?? [])]) {
    const prior = queue.find(
      (q) =>
        !q.file &&
        q.state !== 'done' &&
        q.name === file.name &&
        q.size === file.size &&
        q.type === file.type,
    );
    if (prior) {
      prior.file = file;
      prior.state = 'waiting';
      continue;
    }
    const row = document.createElement('li'),
      span = document.createElement('span'),
      preview = document.createElement('img'),
      button = document.createElement('button');
    row.append(span);
    if (file.type.startsWith('image/') && file.type !== 'image/heic') {
      const url = URL.createObjectURL(file);
      preview.src = url;
      preview.alt = 'Selected photo preview';
      preview.width = 80;
      preview.onload = () => URL.revokeObjectURL(url);
      row.prepend(preview);
    }
    button.type = 'button';
    button.textContent = 'Retry photo';
    button.hidden = true;
    row.append(button);
    const item: Upload = {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      state: 'waiting',
      row,
    };
    queue.push(item);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove from upload queue';
    remove.onclick = () => {
      queue = queue.filter((q) => q !== item);
      item.file = undefined;
      row.remove();
      uploadActivity();
      writeStored();
    };
    row.append(remove);
    photos.querySelector('[data-upload-queue]')!.append(row);
    uploadLabel(
      item,
      product ? 'Waiting to upload' : 'Selected — save draft to upload',
    );
    button.onclick = () => {
      void serial(() => uploadOne(item)).catch((e) => errors(uploadStatus, e));
    };
  }
  uploadInput.value = '';
  writeStored();
  if (product) void serial(uploadWaiting).catch((e) => errors(uploadStatus, e));
  else status(uploadStatus, 'Photos selected. Save the draft to upload them.');
});
for (const [selector, actionName] of [
  ['[data-delete-listing]', 'product.delete'],
  ['[data-restore-listing]', 'product.restore'],
  ['[data-purge-listing]', 'product.purge'],
] as const) {
  document.querySelector(selector)!.addEventListener('click', () => {
    void serial(async () => {
      if (!product) return;
      if (!equal(capture(), base)) {
        const choice = await pendingChoice();
        if (choice === 'cancel') return;
        if (choice === 'save') await save();
        else {
          for (const key of ['details', 'variants', 'images'] as const)
            renderSection(key, base[key]);
        }
      }
      if (
        !window.confirm(
          actionName === 'product.purge'
            ? `Permanently delete ${product.name}? Only unused drafts can be removed. This cannot be undone.`
            : actionName === 'product.delete'
              ? `Move ${product.name} to Trash? Orders and stock history are kept.`
              : `Restore ${product.name} as a private draft?`,
        )
      )
        return;
      const payload = {
          id: product.id,
          revision: product.revision,
          confirmed: true,
        },
        key = persistentOperation(actionName + ':' + product.id);
      try {
        const prior = key.pending();
        let result = await action<Product & { purged?: boolean }>(actionName, {
          ...(prior?.data ?? payload),
          operationKey: prior?.id ?? key.get(payload),
        });
        key.clear();
        if (result.purged) {
          try {
            sessionStorage.removeItem(draftKey);
          } catch {}
          location.assign('/admin/?status=trash');
        } else {
          const latest = await action<Product>('product.get', {
            id: result.id,
          });
          if (latest.revision !== result.revision) {
            adopt(latest);
            status(
              document.querySelector('[data-lifecycle-status]')!,
              'Earlier action confirmed. The listing changed afterward; review the current version before continuing.',
            );
            return;
          }
          result = latest;
          adopt(result, capture(), ['details', 'variants', 'images']);
          status(
            document.querySelector('[data-lifecycle-status]')!,
            actionName === 'product.delete'
              ? 'Listing moved to Trash.'
              : 'Listing restored as a draft.',
          );
        }
      } catch (e) {
        key.rejected(e);
        throw e;
      }
    }).catch((e) =>
      errors(document.querySelector('[data-lifecycle-status]')!, e),
    );
  });
}
function pendingChoice(): Promise<'save' | 'discard' | 'cancel'> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog'),
      p = document.createElement('p');
    p.textContent = 'This listing has unsaved changes.';
    dialog.append(p);
    for (const [label, value] of [
      ['Save changes', 'save'],
      ['Discard changes', 'discard'],
      ['Cancel', 'cancel'],
    ] as const) {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      dialog.append(b);
    }
    dialog.oncancel = () => {
      dialog.remove();
      resolve('cancel');
    };
    document.body.append(dialog);
    dialog.showModal();
  });
}
window.addEventListener('beforeunload', (e) => {
  if (pending || queue.some((q) => q.file)) {
    e.preventDefault();
  }
});

if (operation.pending())
  void serial(async () => {}).catch((e) => errors(productStatus, e));

try {
  for (const prior of recoveredUploads) {
    const row = document.createElement('li'),
      span = document.createElement('span'),
      button = document.createElement('button');
    button.type = 'button';
    button.hidden = true;
    row.append(span, button);
    photos.querySelector('[data-upload-queue]')!.append(row);
    const item: Upload = { ...prior, row, state: 'failed' };
    queue.push(item);
    button.onclick = () => {
      void serial(() => uploadOne(item)).catch((e) => errors(uploadStatus, e));
    };
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove from upload queue';
    remove.onclick = () => {
      queue = queue.filter((q) => q !== item);
      row.remove();
      uploadActivity();
      writeStored();
    };
    row.append(remove);
    uploadLabel(item, 'Reselect this file to continue');
    if (item.intent)
      void serial(async () => {
        try {
          const result = await action<{ image: Photo; product: Product }>(
            'photo.finalize',
            { id: item.intent!.id },
          );
          adopt(result.product);
          item.state = 'done';
          uploadLabel(item, 'Verified and saved');
          writeStored();
        } catch {
          uploadLabel(item, 'Reselect this file to retry the tracked upload');
        }
      });
  }
} catch {}

window.addEventListener('gag:stock-saved', () => {
  if (product)
    void action<Product>('product.get', { id: product.id })
      .then((next) => {
        syncStock(next);
        const total = next.variants
          .filter((v) => v.active)
          .reduce(
            (n, v) => n + (v.stock?.unsoldQty ?? 0) - (v.stock?.heldQty ?? 0),
            0,
          );
        document.querySelector('.editor-stock strong')!.textContent =
          String(total);
      })
      .catch((e) => errors(productStatus, e));
});

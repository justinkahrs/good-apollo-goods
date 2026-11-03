import { action, status, recoverForm } from './admin';
type Variant = {
  id?: string;
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
  if (single) singlePrice.value = field(rows[0], 'price').value;
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
const clear = recoverForm(form, 'gag-product:' + (defaults.id ?? 'new'));
form.addEventListener('recovered', () => {
  try {
    const variants = JSON.parse(
      (form.querySelector('[data-variants-json]') as HTMLInputElement).value,
    );
    root.replaceChildren();
    for (const v of variants) addRow({ ...v, priceCents: 0 });
    presentation();
    if (variants.length !== 1 || Object.keys(variants[0].options).length)
      variantSettings.open = true;
  } catch {}
});
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
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const s = form.querySelector('[data-product-status]')!,
    button = form.querySelector<HTMLButtonElement>('[type=submit]')!;
  button.disabled = true;
  try {
    const result = await action<{ id: string }>('product.save', {
      ...data,
      revision: Number(data.revision),
      variants: serialize(),
    });
    clear();
    location.assign('/admin/products/' + result.id + '/');
  } catch (error) {
    status(s, (error as Error).message, error as Error);
  } finally {
    button.disabled = false;
  }
});
document
  .querySelector('[data-duplicate]')
  ?.addEventListener('click', async () => {
    const button = document.querySelector<HTMLElement>('[data-duplicate]')!;
    const result = await action<{ id: string }>('product.duplicate', {
      id: button.dataset.duplicate,
    });
    location.assign('/admin/products/' + result.id + '/');
  });
const photos = document.querySelector<HTMLElement>('[data-photos]');
if (photos) {
  const list = photos.querySelector('ol')!;
  const photoForm = photos.querySelector('form')!;
  const saved = document.createElement('input');
  saved.type = 'hidden';
  saved.name = 'photoState';
  photoForm.append(saved);
  const photoState = () =>
    [...list.querySelectorAll<HTMLElement>('[data-photo-id]')].map((row) => ({
      id: row.dataset.photoId!,
      alt: (row.querySelector('[data-alt]') as HTMLInputElement).value,
      variantId:
        (row.querySelector('[data-variant-association]') as HTMLSelectElement)
          .value || null,
      archived: (row.querySelector('[data-archive]') as HTMLInputElement)
        .checked,
    }));
  const syncPhotos = () => {
    saved.value = JSON.stringify(photoState());
  };
  syncPhotos();
  photoForm.addEventListener('input', syncPhotos);
  const clearPhotos = recoverForm(
    photoForm,
    'gag-photos:' + photos.dataset.productId,
  );
  photoForm.addEventListener('recovered', () => {
    try {
      for (const image of JSON.parse(saved.value)) {
        const row = [
          ...list.querySelectorAll<HTMLElement>('[data-photo-id]'),
        ].find((row) => row.dataset.photoId === image.id);
        if (!row) continue;
        (row.querySelector('[data-alt]') as HTMLInputElement).value = image.alt;
        (
          row.querySelector('[data-variant-association]') as HTMLSelectElement
        ).value = image.variantId ?? '';
        (row.querySelector('[data-archive]') as HTMLInputElement).checked =
          image.archived;
        list.append(row);
      }
      labels();
    } catch {}
  });
  function labels() {
    let cover = false;
    [...list.children].forEach((li) => {
      const visible = !(li.querySelector('[data-archive]') as HTMLInputElement)
        .checked;
      li.querySelector('[data-cover-label]')!.textContent =
        visible && !cover ? 'Cover' : '';
      if (visible) cover = true;
    });
  }
  labels();
  list.addEventListener('change', labels);
  list.addEventListener('click', (e) => {
    const target = e.target as HTMLElement,
      row = target.closest('li');
    if (!row) return;
    if (target.matches('[data-up]') && row.previousElementSibling)
      list.insertBefore(row, row.previousElementSibling);
    if (target.matches('[data-down]') && row.nextElementSibling)
      list.insertBefore(row.nextElementSibling, row);
    if (target.matches('[data-cover]')) list.prepend(row);
    labels();
    syncPhotos();
    photoForm.dispatchEvent(new Event('input'));
  });
  photos.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = photos.querySelector('[data-photo-status]')!;
    try {
      await action('photo.save', {
        productId: photos.dataset.productId,
        revision: Number(photos.dataset.revision),
        images: [...list.querySelectorAll<HTMLElement>('[data-photo-id]')].map(
          (row) => ({
            id: row.dataset.photoId,
            alt: (row.querySelector('[data-alt]') as HTMLInputElement).value,
            variantId:
              (
                row.querySelector(
                  '[data-variant-association]',
                ) as HTMLSelectElement
              ).value || null,
            archived: (row.querySelector('[data-archive]') as HTMLInputElement)
              .checked,
          }),
        ),
      });
      clearPhotos();
      location.reload();
    } catch (error) {
      status(s, (error as Error).message, error as Error);
    }
  });
  photos
    .querySelector<HTMLInputElement>('[data-upload]')!
    .addEventListener('change', async (e) => {
      const input = e.target as HTMLInputElement,
        s = photos.querySelector('[data-upload-status]')!,
        progress = photos.querySelector<HTMLProgressElement>('progress')!;
      progress.hidden = false;
      input.disabled = true;
      try {
        for (const file of [...(input.files ?? [])]) {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
            throw new Error(
              'Export HEIC or other unsupported photos as JPEG, PNG or WebP. Existing photos and product entries are saved.',
            );
          if (file.size > 10 * 1024 * 1024)
            throw new Error('Photo must be 10 MB or smaller.');
          s.textContent = 'Uploading ' + file.name + '…';
          const intent = await action<{ id: string; url: string }>(
            'photo.intent', {
            productId: photos.dataset.productId,
            type: file.type,
            bytes: file.size,
            },
          );
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', intent.url);
            xhr.setRequestHeader('Content-Type', file.type);
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable)
                progress.value = (e.loaded / e.total) * 100;
            };
            xhr.onload = () =>
              xhr.status >= 200 && xhr.status < 300
                ? resolve()
                : reject(
                    new Error(
                      'Photo upload failed. Choose the file again to retry.',
                    ),
                  );
            xhr.onerror = () =>
              reject(
                new Error(
                  'Upload connection failed. Choose the file again to retry.',
                ),
              );
            xhr.send(file);
          });
          await action('photo.finalize', { id: intent.id });
        }
        location.reload();
      } catch (error) {
        status(s, (error as Error).message, error as Error);
      } finally {
        input.disabled = false;
        input.value = '';
        progress.hidden = true;
      }
    });
}

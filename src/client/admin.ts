import { post } from './cart';
export async function action<T = Record<string, unknown>>(
  action: string,
  data: unknown,
) {
  return post<T>('/api/admin/action/', { action, data });
}
export function status(
  root: Element,
  message: string,
  error?: Error & { code?: string },
) {
  root.textContent = message;
  if (['signin', 'verify'].includes(error?.code ?? '')) {
    const a = document.createElement('a');
    a.href = error?.code === 'signin' ? '/admin/sign-in/' : '/admin/verify/';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = ' Verify access, then return here to save.';
    root.append(a);
  }
}
export function recoverForm(form: HTMLFormElement, key: string) {
  const recover = document.createElement('button');
  recover.type = 'button';
  recover.textContent = 'Restore unsaved entries';
  recover.hidden = !sessionStorage.getItem(key);
  form.prepend(recover);
  recover.addEventListener('click', () => {
    try {
      const values = JSON.parse(sessionStorage.getItem(key) ?? '{}');
      for (const control of form.elements) {
        const e = control as HTMLInputElement;
        if (!e.name || values[e.name] === undefined) continue;
        if (e.type === 'checkbox') e.checked = values[e.name] === 'on';
        else e.value = values[e.name];
      }
      form.dispatchEvent(new Event('recovered'));
      recover.hidden = true;
    } catch {}
  });
  form.addEventListener('input', () => {
    const values: Record<string, FormDataEntryValue> = {};
    for (const control of form.elements) {
      const e = control as HTMLInputElement;
      if (e.name && e.type === 'checkbox')
        values[e.name] = e.checked ? 'on' : 'off';
    }
    for (const [k, v] of new FormData(form)) {
      if (typeof v === 'string') values[k] = v;
    }
    sessionStorage.setItem(key, JSON.stringify(values));
  });
  return () => sessionStorage.removeItem(key);
}
// Keep an unresolved mutation's identity when the browser reloads after losing
// its response. The same entries retry it; confirmed validation errors release it.
export function persistentOperation(scope: string) {
  const key = 'gag-operation:' + scope;
  return {
    get(data: unknown) {
      const fingerprint = JSON.stringify(data);
      const prior = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      if (prior && prior.fingerprint !== fingerprint)
        throw new Error(
          'An earlier request is awaiting confirmation. Restore its entries and retry before starting a different change.',
        );
      const operation = prior ?? { fingerprint, id: crypto.randomUUID() };
      sessionStorage.setItem(key, JSON.stringify(operation));
      return operation.id as string;
    },
    clear() {
      sessionStorage.removeItem(key);
    },
    rejected(error: unknown) {
      if ([400, 409, 422].includes((error as { status?: number }).status ?? 0))
        this.clear();
    },
  };
}

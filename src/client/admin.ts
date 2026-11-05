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
export function recoverForm(
  form: HTMLFormElement,
  key: string,
  automatic = false,
) {
  const recover = document.createElement('button');
  recover.type = 'button';
  recover.textContent = 'Restore unsaved entries';
  const read = () => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (value: string) => {
    try {
      sessionStorage.setItem(key, value);
    } catch {}
  };
  recover.hidden = !read();
  form.prepend(recover);
  recover.addEventListener('click', () => {
    try {
      const values = JSON.parse(read() ?? '{}');
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
  if (automatic && read()) queueMicrotask(() => recover.click());
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
    write(JSON.stringify(values));
  });
  return () => {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  };
}
// Keep an unresolved mutation's identity when the browser reloads after losing
// its response. The same entries retry it; confirmed validation errors release it.
export function persistentOperation(scope: string) {
  const key = 'gag-operation:' + scope;
  let memory: { fingerprint: string; id: string; data: unknown } | null = null;
  return {
    get(data: unknown, fingerprintData: unknown = data) {
      const fingerprint = JSON.stringify(fingerprintData);
      let prior = memory;
      try {
        prior = JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? memory;
      } catch {}
      if (prior && prior.fingerprint !== fingerprint)
        throw new Error(
          'An earlier request is awaiting confirmation. Restore its entries and retry before starting a different change.',
        );
      const operation = prior ?? { fingerprint, id: crypto.randomUUID(), data };
      memory = operation;
      try {
        sessionStorage.setItem(key, JSON.stringify(operation));
      } catch {}
      return operation.id as string;
    },
    pending() {
      let prior = memory;
      try {
        prior = JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? memory;
      } catch {}
      if (prior && !prior.data) {
        try {
          prior = { ...prior, data: JSON.parse(prior.fingerprint) };
        } catch {}
      }
      return prior;
    },
    clear() {
      memory = null;
      try {
        sessionStorage.removeItem(key);
      } catch {}
    },
    rejected(error: unknown) {
      if ([400, 409, 422].includes((error as { status?: number }).status ?? 0))
        this.clear();
    },
  };
}

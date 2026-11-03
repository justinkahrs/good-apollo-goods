const forms = document.querySelectorAll<HTMLFormElement>('[data-newsletter-form]');

for (const form of forms) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const status = form.querySelector<HTMLElement>('[data-newsletter-status]');
    if (!button || !status) return;
    button.disabled = true;
    status.textContent = 'Please wait…';
    try {
      const values = new FormData(form);
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(values.entries())),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.message !== 'string')
        throw new Error(result?.error || 'This action could not be completed. Please try again shortly.');
      status.textContent = result.message;
      if (result.confirmed || result.withdrawn) form.hidden = true;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'This action could not be completed. Please try again shortly.';
      button.disabled = false;
      status.focus();
    }
  });
}

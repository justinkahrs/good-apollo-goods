export function initProductGallery(
  gallery: HTMLElement | null,
  form: HTMLFormElement | null,
) {
  if (!gallery) return;

  const slides = [
    ...gallery.querySelectorAll<HTMLElement>('[data-gallery-slide]'),
  ];
  if (slides.length < 2) return;

  const controls = gallery.querySelector<HTMLElement>(
      '[data-gallery-controls]',
    ),
    navigation = gallery.querySelector<HTMLElement>(
      '[data-gallery-navigation]',
    ),
    status = gallery.querySelector<HTMLElement>('[data-gallery-status]'),
    previous = gallery.querySelector<HTMLButtonElement>(
      '[data-gallery-previous]',
    ),
    next = gallery.querySelector<HTMLButtonElement>('[data-gallery-next]');

  let visibleSlides = slides.map((_, index) => index);
  let activeSlide = visibleSlides[0];

  const selectedVariant = () =>
    form?.querySelector<HTMLInputElement>('input[name="variant"]:checked')
      ?.value ??
    form?.querySelector<HTMLInputElement>(
      'input[name="variant"][type="hidden"]',
    )?.value ??
    '';

  const render = (requestedSlide?: number) => {
    const variantId = selectedVariant();
    const allSlides = slides.map((slide, index) => ({
      slide,
      index,
      variantId: slide.dataset.variantPhoto ?? '',
    }));
    const globalSlides = allSlides.filter((item) => !item.variantId);
    const matchingSlides = variantId
      ? allSlides.filter((item) => item.variantId === variantId)
      : [];
    const matching = [...globalSlides, ...matchingSlides]
      .map((item) => item.index)
      .sort((a, b) => a - b);

    visibleSlides = matching.length
      ? matching
      : allSlides.map((item) => item.index);
    activeSlide =
      requestedSlide !== undefined && visibleSlides.includes(requestedSlide)
        ? requestedSlide
        : visibleSlides.includes(activeSlide)
          ? activeSlide
          : visibleSlides[0];

    const activePosition = visibleSlides.indexOf(activeSlide);
    for (const [index, slide] of slides.entries()) {
      const isVisible = visibleSlides.includes(index);
      const isActive = index === activeSlide;
      slide.hidden = !isVisible || !isActive;
      slide.toggleAttribute('data-gallery-active', isActive);
    }

    const hasNavigation = visibleSlides.length > 1;
    if (controls) controls.hidden = !hasNavigation;
    if (navigation) navigation.hidden = !hasNavigation;
    if (status) {
      status.textContent = `Photo ${activePosition + 1} of ${visibleSlides.length}`;
    }
  };

  const move = (offset: number) => {
    const position = visibleSlides.indexOf(activeSlide);
    const nextPosition =
      (position + offset + visibleSlides.length) % visibleSlides.length;
    render(visibleSlides[nextPosition]);
  };

  previous?.addEventListener('click', () => move(-1));
  next?.addEventListener('click', () => move(1));
  form?.addEventListener('change', () => render(visibleSlides[0]));
  gallery.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  });

  let pointerStart: { x: number; y: number } | undefined;
  gallery.addEventListener('pointerdown', (event) => {
    pointerStart =
      event.pointerType === 'touch'
        ? { x: event.clientX, y: event.clientY }
        : undefined;
  });
  gallery.addEventListener('pointerup', (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = undefined;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    move(dx < 0 ? 1 : -1);
  });

  gallery.dataset.galleryReady = 'true';
  render();
}

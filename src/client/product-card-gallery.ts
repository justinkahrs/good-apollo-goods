export function initProductCardGallery() {
  document
    .querySelectorAll<HTMLElement>('[data-product-card-gallery]')
    .forEach((gallery) => {
      const slides = [
        ...gallery.querySelectorAll<HTMLImageElement>('[data-card-slide]'),
      ];
      if (slides.length < 2) return;

      let activeIndex = 0;

      const show = (index: number) => {
        slides[activeIndex].hidden = true;
        activeIndex = index;
        slides[activeIndex].hidden = false;
      };

      const reset = () => {
        if (activeIndex !== 0) show(0);
      };

      gallery.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch') return;
        show(1);
      });

      gallery.addEventListener('pointerleave', reset);
    });
}

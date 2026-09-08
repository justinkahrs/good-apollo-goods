# Good Apollo

A prelaunch storefront for handmade crochet, knitwear, and sewn goods, built with Astro, TypeScript, and a token-based design system. Related to [Good Apollo Garden](https://www.goodapollogarden.com/), with a distinct warm, indoor identity.

## Development

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
npm run build
npm run preview
```

The development URL is printed by Astro (normally `http://localhost:4321`). This Astro version manages its development server in the background; `npx astro dev stop` stops it. `npm run build` runs Astro's type checker before generating the static site in `dist/`.

## Design and content

- `src/styles/tokens.css` — colors, typography, spacing, shape, motion, and page dimensions.
- `src/styles/global.css` — shared styles and Tailwind's token bridge.
- `src/components/` — reusable storefront components.
- `src/data/products.ts` — typed catalog data and sample prices in USD.
- `src/assets/` — AI-created sample photographs, optimized by Astro at build time.
- `docs/design-system.md` — design rationale, editing guide, accessibility, and launch boundary.
- `/design-system/` — live component and foundation reference.

The catalog is static HTML. Craft filtering is a small progressive-enhancement script; navigation, piece pages, and disclosures work without JavaScript. Fonts and images are local, with responsive WebP derivatives generated during the build.

## Prelaunch status

The three pieces, images, and prices are illustrative samples. No payments, email collection, or inventory reservations are implemented. All pages are marked `noindex, nofollow` pending real content and launch preparation. No date or shipping promises have been invented.

Replace sample data/photos and choose a commerce provider before enabling purchases. Final inventory, payment confirmation, shipping, and tax rules belong in that provider; do not implement authoritative stock using browser storage.

## Deployment

The output is portable static HTML and assets in `dist/`. `.openai/hosting.json` points to the private Sites preview. Deploying elsewhere only requires a static host; an Astro server adapter is not needed.

# Good Apollo

A prelaunch storefront for handmade crochet, knitwear, and sewn goods, built with Astro, TypeScript, and a token-based design system. Related to [Good Apollo Garden](https://www.goodapollogarden.com/), with a distinct warm, indoor identity.

## Development

Requires Node.js 22.12 or newer within the 22.x release line, and npm.

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

Production hosting uses Vercel project `good-apollo-goods` in `justinkahrs-projects`. The working production URL is https://good-apollo-goods.vercel.app/. The primary domain is `goodapollogoods.com`; `www.goodapollogoods.com` redirects to it with HTTP 308 after DNS is configured.

`vercel.json` configures Astro, `npm ci`, `npm run build`, the `dist/` output directory, and trailing slashes. Vercel builds with Node.js 22.x. After authenticating to Vercel, deploy future changes with:

```sh
npx vercel --prod --scope justinkahrs-projects
```

The local `.vercel/` link is ignored by Git. `.vercelignore` excludes `.env` files and the earlier Sites configuration from uploads. `VERCEL_TOKEN` is only a local deployment credential; it is not a site runtime variable. The old `.openai/hosting.json` is retained as a record of the unsuccessful Sites preview setup, not the production host.

See `docs/deployment.md` for the exact GoDaddy DNS records and verification steps. The output remains portable static HTML and assets in `dist/`; an Astro server adapter is not needed.

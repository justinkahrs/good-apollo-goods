# Good Apollo

A prelaunch storefront for Good Apollo Goods, a one-woman label making small-batch child and adult hats in Grand Rapids, Michigan. The site is built with Astro, TypeScript, and a token-based design system.

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
- `src/data/products.ts` — typed hat catalog data, sizing, availability, and draft prices in USD.
- `src/assets/` — the branded Coming Soon product-art placeholder, optimized by Astro at build time.
- `docs/design-system.md` — design rationale, editing guide, accessibility, and launch boundary.
- `/design-system/` — live component and foundation reference.

The catalog, category pages, product details, sizing guide, About page, Consignment / Stockists page, and help content are static HTML. The cart is a lightweight client-side preview stored in browser storage; all browsing content works without JavaScript. Fonts and images are local, with responsive WebP derivatives generated during the build.

## Prelaunch status

The current product names, prices, availability, and branded placeholder art are working launch content and should be confirmed before opening sales. No payments, email collection, or authoritative inventory reservations are implemented. All pages remain marked `noindex, nofollow` pending final product photography, policies, contact details, and commerce setup.

Replace each placeholder with finished product photography and connect a commerce provider before enabling checkout. Final inventory, payment confirmation, shipping, and tax rules belong in that provider; the preview cart must not become the authoritative stock ledger.

## Deployment

Production hosting uses Vercel project `good-apollo-goods` in `justinkahrs-projects`. The working production URL is https://good-apollo-goods.vercel.app/. The primary domain is `goodapollogoods.com`; `www.goodapollogoods.com` redirects to it with HTTP 308 after DNS is configured.

`vercel.json` configures Astro, `npm ci`, `npm run build`, the `dist/` output directory, and trailing slashes. Vercel builds with Node.js 22.x. After authenticating to Vercel, deploy future changes with:

```sh
npx vercel --prod --scope justinkahrs-projects
```

The local `.vercel/` link is ignored by Git. `.vercelignore` excludes `.env` files and the earlier Sites configuration from uploads. `VERCEL_TOKEN` is only a local deployment credential; it is not a site runtime variable. The old `.openai/hosting.json` is retained as a record of the unsuccessful Sites preview setup, not the production host.

See `docs/deployment.md` for the exact GoDaddy DNS records and verification steps. The output remains portable static HTML and assets in `dist/`; an Astro server adapter is not needed.

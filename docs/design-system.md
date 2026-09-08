# Good Apollo design system

A warm editorial storefront for an eclectic home practice. The palette, expressive serif, arch-shaped photography, and unhurried language should make the work feel personal and worth keeping. Good Apollo is related to Good Apollo Garden through its serif/sans pairing and love of making, with a separate indoor identity.

## Sources of truth

- `src/styles/tokens.css`: primitive colors, semantic roles, typography, spacing, radii, motion, and layout constants.
- `src/styles/global.css`: reset, accessibility defaults, Tailwind theme bridge, and shared component classes.
- `src/components/`: reusable Astro components with locally scoped styles.
- `/design-system/`: rendered examples of the actual tokens and components used by the storefront.
- `src/data/products.ts`: typed sample catalog, categories, copy, prices, image imports, and USD formatting.

Do not duplicate color literals in component styles. Change semantic roles to retheme broadly; change a primitive to affect all roles mapped to it. Local sizing for distinctive art direction can remain in its component. Tailwind's base spacing maps to `--space-1`; named `--space-*` tokens define the explicit scale.

## Color

| Role | Token | Use |
| --- | --- | --- |
| Text | `--color-text` | Headings, body, and labels |
| Secondary text | `--color-muted` | Supporting copy, metadata |
| Brand | `--color-brand` | Buttons, announcement, italic emphasis |
| Brand hover | `--color-brand-hover` | Hovered primary actions |
| Page | `--color-page` | Main warm paper background |
| Surface | `--color-surface` | Story section, quiet notices |
| Raised surface | `--color-surface-raised` | Product badges |
| Accent | `--color-accent` | Small butter-yellow accents |
| Border | `--color-border` | Dividers and boundaries |
| Focus | `--color-focus` | Keyboard focus on light surfaces |
| Inverse focus | `--color-focus-inverse` | Keyboard focus on plum surfaces |

Use plum and butter sparingly. The images provide most of the color. Avoid gradients, strong shadows, or an abundance of bordered boxes. When changing colors, verify text contrast at 4.5:1 for regular text and focus indicators at 3:1 against their background.

## Typography

Fraunces Variable is the display face; DM Sans Variable is the body face. Fonts are bundled locally through Fontsource. Display text uses soft, slightly irregular shapes. Italics are used for an occasional warm emphasis, not long paragraphs.

Body copy starts at 1rem with 1.6–1.8 line height. Controls are 0.875rem; nonessential metadata is 0.8125rem. Fluid type tokens define hero and section scales. Tiny wordmark/seal lettering is decorative brand content, not essential interface information.

## Layout and shape

The page container caps at 1440px and uses fluid gutters. Spacing follows a 4px base scale; section gaps are fluid. Layouts collapse at 800px for editorial splits and at 700px for single-column product browsing, with a two-column intermediate catalog below 1000px.

Use small image corners for products. Reserve arched images for the hero/story. Buttons and category filters use pill corners. Product names and prices sit below photographs; avoid putting whole products inside card shells.

## Components and behavior

- `Brand`: regular and large wordmark variants.
- `Button`: primary/secondary; link or native button; optional arrow; disabled state only for buttons. Buttons default to `type="button"`.
- `Header` / `Footer`: shared navigation and prelaunch context.
- `ProductCard`: image, craft, name, sample price, and link to static piece page.
- `Collection`: progressive enhancement for craft filters. All pieces remain visible without JavaScript. Filters expose `aria-pressed`, a polite result count, and a shareable `?craft=` parameter.
- `Opening`: native HTML disclosure elements, usable without JavaScript.
- `Layout`: metadata, local fonts, skip link, main landmark, header, footer.

Movement is limited to subtle hover image scaling and small arrow/button feedback. No continuous movement, parallax, or scroll hijacking. Honor `prefers-reduced-motion` globally. Keyboard focus must remain visible, and filtering must not move focus away from the selected button.

## Photography and sample content

The current three images are AI-created concept assets. They are not photographs of real products. The catalog and product detail pages disclose this, and the entire site is marked `noindex, nofollow` while sample content is in use.

Real photography should use warm natural light, faithful colors, and visible workmanship. Include real dimensions, materials, care instructions, and useful scale/context for each item before enabling sales. Do not infer these facts from an image.

## Making changes

1. Adjust colors, type, spacing, and motion in `tokens.css`.
2. Review `/design-system/` and the home and product routes.
3. Change a reusable component to change every instance.
4. Replace sample content in `products.ts`, keeping presentation out of the data.
5. Run `npm run build` to type-check all Astro/TypeScript files and produce optimized static output.

## Launch boundary

This is an intentional prelaunch site. It has no checkout, cart, email collection, or fabricated stock counts. Before opening: replace sample assets/data; define shipping, returns, contact information, and final pricing; connect the selected commerce provider; enforce quantity-one inventory at that provider; then update prelaunch copy and robots metadata. A static page alone must never be used as the authoritative inventory ledger.

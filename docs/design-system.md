# Good Apollo design system

A warm editorial storefront for a small independent hat label. The palette, expressive serif, arch-shaped imagery, and unhurried language should make the work feel personal and worth keeping without drifting into generic craft-marketplace styling.

## Sources of truth

- `src/styles/tokens.css`: primitive colors, semantic roles, typography, spacing, radii, motion, and layout constants.
- `src/styles/global.css`: reset, accessibility defaults, Tailwind theme bridge, and shared component classes.
- `src/components/`: reusable Astro components with locally scoped styles.
- `/design-system/`: rendered examples of the actual tokens and components used by the storefront.
- `src/data/products.ts`: typed hat catalog, audience categories, product details, sizing, availability, image imports, and USD formatting.

Do not duplicate color literals in component styles. Change semantic roles to retheme broadly; change a primitive to affect all roles mapped to it. Local sizing for distinctive art direction can remain in its component. Tailwind's base spacing maps to `--space-1`; named `--space-*` tokens define the explicit scale.

## Color

| Role | Token | Use |
| --- | --- | --- |
| Text | `--color-text` | Headings, body, and labels |
| Secondary text | `--color-muted` | Supporting copy, metadata |
| Brand | `--color-brand` | Burgundy buttons, announcement, selected states |
| Brand hover | `--color-brand-hover` | Hovered primary actions |
| Page | `--color-page` | Buttercream page background |
| Surface | `--color-surface` | Dusty lilac editorial sections and cards |
| Strong surface | `--color-surface-strong` | Cornflower navigation and preview states |
| Raised surface | `--color-surface-raised` | Buttercream content on colored surfaces |
| Accent | `--color-accent` | Cornflower interactive and graphic accents |
| Secondary | `--color-secondary` | Dusty lilac supporting surfaces |
| Border | `--color-border` | Dividers and boundaries |
| Focus | `--color-focus` | Keyboard focus on light surfaces |
| Inverse focus | `--color-focus-inverse` | Keyboard focus on burgundy surfaces |

The source palette is fixed: buttercream `#E5E3C8`, cornflower blue `#8B9AC5`, dusty lilac `#BCB4BC`, deep burgundy `#6E322D`, and dark plum/brown `#342427`. Cornflower and lilac should carry meaningful surface area, not appear only as tiny accents. Avoid gradients, strong shadows, or generic beige and sage substitutions. When changing color roles, verify text contrast at 4.5:1 for regular text and focus indicators at 3:1 against their background.

## Typography

Fraunces Variable is the display face; DM Sans Variable is the body face. Fonts are bundled locally through Fontsource. Display text uses soft, slightly irregular shapes. Italics are used for an occasional warm emphasis, not long paragraphs.

Body copy starts at 1rem with 1.6–1.8 line height. Controls are 0.875rem; nonessential metadata is 0.8125rem. Fluid type tokens define hero and section scales. Tiny wordmark/seal lettering is decorative brand content, not essential interface information.

## Layout and shape

The page container caps at 1440px and uses fluid gutters. Spacing follows a 4px base scale; section gaps are fluid. Layouts collapse at 800px for editorial splits and at 700px for single-column product browsing, with a two-column intermediate catalog below 1000px.

Use small image corners for products. Reserve arched images for the hero/story. Buttons and category filters use pill corners. Product names and availability sit below photographs; prices appear only after a product is officially released. Avoid putting whole products inside card shells.

## Components and behavior

- `Brand`: regular and large wordmark variants.
- `Button`: primary/secondary; link or native button; optional arrow; disabled state only for buttons. Buttons default to `type="button"`.
- `Header` / `Footer`: shared navigation, cart count, help links, and brand context.
- `ProductCard`: image, audience, status, name, color, lining, optional released-product price, and link to a static product page.
- `Collection`: shared presentation for All Hats, Adult, and Child category pages.
- `PageHero`: reusable editorial heading block for information pages.
- `Layout`: metadata, local fonts, skip link, main landmark, header, footer.

Movement is limited to subtle hover image scaling and small arrow/button feedback. No continuous movement, parallax, or scroll hijacking. Honor `prefers-reduced-motion` globally. Keyboard focus must remain visible, and filtering must not move focus away from the selected button.

## Photography and launch content

The current product image is a branded Coming Soon placeholder made specifically for Good Apollo Goods. It includes the wordmark as a watermark and patternmaking details, so unfinished photography still feels intentional. The entire site remains marked `noindex, nofollow` while placeholder imagery and draft commerce data are in use.

Real photography should use warm natural light, faithful colors, and visible workmanship. Include real dimensions, materials, care instructions, and useful scale/context for each item before enabling sales. Do not infer these facts from an image.

## Making changes

1. Adjust colors, type, spacing, and motion in `tokens.css`.
2. Review `/design-system/` and the home and product routes.
3. Change a reusable component to change every instance.
4. Replace sample content in `products.ts`, keeping presentation out of the data.
5. Run `npm run build` to type-check all Astro/TypeScript files and produce optimized static output.

## Launch boundary

This is an intentional prelaunch site. Coming-soon products have no prices or purchase controls. The browser-local cart is reserved for future products explicitly marked Available; there is no checkout, payment processing, email collection, or authoritative inventory. Before opening: replace placeholder imagery, add actual prices only to released batches, define final shipping and returns policies, verify contact information, connect the selected commerce provider, enforce inventory there, and update robots metadata. A static page or browser storage must never be used as the authoritative inventory ledger.

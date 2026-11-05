# Good Apollo design system

A warm editorial storefront for a small independent hat label. The palette, expressive serif, arch-shaped imagery, and unhurried language should make the work feel personal and worth keeping without drifting into generic craft-marketplace styling.

## Sources of truth

- `src/styles/tokens.css`: primitive colors, semantic roles, typography, spacing, radii, motion, and layout constants.
- `src/styles/global.css`: reset, accessibility defaults, Tailwind theme bridge, and shared component classes.
- `src/components/`: reusable Astro components with locally scoped styles.
- `/design-system/`: rendered examples of the actual tokens and components used by the storefront.
- `src/server/catalog.ts` and PostgreSQL: current products, variants, verified images and available stock. `src/data/products.ts` is a draft import source only.
- `src/styles/admin.css`: operator forms using the brand tokens, visible focus, labeled controls and 44px action targets.

Do not duplicate color literals in component styles. Change semantic roles to retheme broadly; change a primitive to affect all roles mapped to it. Local sizing for distinctive art direction can remain in its component. Tailwind's base spacing maps to `--space-1`; named `--space-*` tokens define the explicit scale.

## Color

| Role           | Token                    | Use                                                 |
| -------------- | ------------------------ | --------------------------------------------------- |
| Text           | `--color-text`           | Headings, body, and labels                          |
| Secondary text | `--color-muted`          | Supporting copy, metadata                           |
| Brand          | `--color-brand`          | Buttons, announcement, italic emphasis              |
| Brand hover    | `--color-brand-hover`    | Hovered primary actions                             |
| Page           | `--color-page`           | Buttercream canvas and negative space               |
| Surface        | `--color-surface`        | Woven-flax supporting surfaces and quiet notices    |
| Raised surface | `--color-surface-raised` | Product badges                                      |
| Secondary      | `--color-secondary`      | Cornflower blue featured sections and major moments |
| Accent         | `--color-accent`         | Soft-marigold decorative details                    |
| Border         | `--color-border`         | Dividers and boundaries                             |
| Focus          | `--color-focus`          | Keyboard focus on light surfaces                    |
| Inverse focus  | `--color-focus-inverse`  | Keyboard focus on burgundy surfaces                 |

Buttercream is the dominant background; cornflower blue is reserved for larger branded moments; woven flax supports quieter surfaces. Marigold is used only for small decorative details. Burgundy is the consistent action color, and dark plum is the default for text and high-contrast UI. Avoid gradients, strong shadows, or an abundance of bordered boxes. When changing colors, verify text contrast at 4.5:1 for regular text and focus indicators at 3:1 against their background.

## Typography

Fraunces Variable is the display face; DM Sans Variable is the body face. Fonts are bundled locally through Fontsource. Display text uses soft, slightly irregular shapes. Italics are used for an occasional warm emphasis, not long paragraphs.

Body copy starts at 1rem with 1.6–1.8 line height. Controls are 0.875rem; nonessential metadata is 0.8125rem. Fluid type tokens define hero and section scales. Tiny wordmark/seal lettering is decorative brand content, not essential interface information.

## Layout and shape

The page container caps at 1440px and uses fluid gutters. Spacing follows a 4px base scale; section gaps are fluid. Layouts collapse at 800px for editorial splits and at 700px for single-column product browsing, with a two-column intermediate catalog below 1000px.

Use small image corners for products. Reserve arched images for the hero/story. Buttons and category filters use pill corners. Product names and prices sit below photographs; avoid putting whole products inside card shells.

## Components and behavior

- `Brand`: regular and large wordmark variants.
- `Button`: primary/secondary; link or native button; optional arrow; disabled state only for buttons. Buttons default to `type="button"`.
- `Header` / `Footer`: shared navigation, cart count, help links, and brand context.
- `ProductCard`: verified responsive image, audience, current availability, name, starting price and a stable product URL from `PublicProduct`.
- `Collection`: shared presentation for All Hats, Adult, and Child category pages.
- `PageHero`: reusable editorial heading block for information pages.
- `Layout`: metadata, local fonts, skip link, main landmark, header, footer.

Movement is limited to subtle hover image scaling and small arrow/button feedback. No continuous movement, parallax, or scroll hijacking. Honor `prefers-reduced-motion` globally. Keyboard focus must remain visible, and filtering must not move focus away from the selected button.

## Photography and launch content

Imported images remain blocked placeholders in private drafts. They cannot be published or sold. An empty public catalog uses the branded opening-soon presentation. Public discovery requires an approved live production release.

Real photography should use warm natural light, faithful colors, and visible workmanship. Include real dimensions, materials, care instructions, and useful scale/context for each item before enabling sales. Do not infer these facts from an image.

## Making changes

1. Adjust colors, type, spacing, and motion in `tokens.css`.
2. Review `/design-system/` and the home and product routes.
3. Change a reusable component to change every instance.
4. Manage merchandise in `/admin/`: descriptions, two option dimensions, prices, photos and explicit stock counts. No source edit or redeployment is required.
5. Run source checks, relevant integration/browser tests and adapter builds. Catalog pages render on demand; informational pages can remain static.

## Launch boundary

This implementation remains prelaunch. PostgreSQL owns stock, reservations and immutable orders; hosted Stripe Checkout verifies payment. The browser cart stores variant identities and requested quantities. Real merchandise, production services, tax verification, sender delivery and primary-operator acceptance remain launch requirements in `docs/launch-checklist.md`.

Operator forms preserve unsaved entries and reject stale revisions. Photo ordering uses keyboard-accessible buttons and describes the first visible photo as cover. Products and Inventory use open rows with cover photos, readable counts and restrained dividers. Orders distinguish payment, packing, refund and dispute states.

Product detail pages show one photo with overlaid dot controls. Dots, arrow keys and touch swipes navigate the gallery; variant-linked photos filter with the selected option. The first photo remains visible without scripting. Responsive WebP derivatives fill a consistent square frame using a bottom-aligned cover crop.

The product editor uses a quiet, open two-column workspace: name, description and fixed size/details on the left; one dollar price, available stock, visibility and save action in a flax-tinted sidebar. On phones the sidebar follows the content. Keep Fraunces headings, DM Sans controls, buttercream inputs, restrained dividers and burgundy actions. `src/styles/product-editor.css` scopes this presentation to the editor. **Offer sizes or colors** and **A little more detail** start folded, so an optionless piece requires no visible SKU or option fields. Variant generation, per-option prices, SKU overrides, stock thresholds, materials, care, tax category and stable URLs remain available through those sections. Photos stay private until a valid publication; saving a new draft opens its photo workflow. Shop pages automatically select an optionless product's one underlying stock identity.

The remaining studio pages share `StudioHeading` and `src/styles/studio.css`, scoped to `.admin-main.studio-page` so production CSS ordering cannot override the workspace. Products puts cover, active available stock, visibility and price together; optionless products omit variant-count clutter. Inventory presents available, held and unsold counts in a soft flax strip, with stock adjustments folded until needed. Orders uses separate status badges and purposeful empty states; detail pages pair immutable purchased pieces with delivery/totals and keep exceptional actions folded. Settings groups shipping/timing, keeps unverified tax configuration expanded, places health/account tools alongside and gives the daily guide an open two-column layout. These layouts become one column on phones; filters, exports, audited changes and security remain available.

### Hats storefront refinement

The public collection has one category, Hats. Legacy art, wearables, adult and child collection URLs redirect to `/shop/hats/`. Product galleries show one photo at a time from the initial render, with overlaid dot controls, keyboard and touch navigation, and a screen-reader photo count; no arrows or thumbnail strip appears. The square frame uses a bottom-aligned cover crop, without colored padding or rounded image corners. Size/details sit in the product metadata table. Piece-choice controls retain touch-sized targets and horizontal padding.

Collection introduction lines are separate block spans with an explicit text space so both visual layout and extracted text keep the sentences distinct.

## Inventory workspace

The product editor retains the studio brand, optional advanced sections and existing routes. Details, photos and stock are reachable in one listing workspace. Save feedback identifies the committed scope; uploads and stock actions update in place. Photo descriptions default to the saved product name with optional custom text. Photo visibility is an explicit Hide/Show choice, and Trash is separate from Archive. Recovery notices and conflict comparisons are keyboard accessible; per-file status and stock balance changes use live announcements. Preserve entered content and focus during unrelated actions.

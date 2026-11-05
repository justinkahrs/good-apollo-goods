# Merchandise catalog

## Purpose

Let the store operator maintain real physical products, variants, prices, descriptions, and photo galleries through the admin and publish accurate storefront content without editing source files.

## ADDED Requirements

### Requirement: Operator-managed product content

The system SHALL let an authorized operator create, edit, duplicate as draft, publish, unpublish, and archive physical products with a name, stable URL, description, category, and optional audience, details, materials, lining, and care content. New products SHALL start as drafts. Duplication SHALL copy content/options but start with zero stock and a new identity/URL.

#### Scenario: Create and edit a draft
- **WHEN** an operator saves a named product with an unfinished description
- **THEN** the draft is retained, can be reopened and edited, and does not appear as a public saleable listing

#### Scenario: Duplicate a small-batch product
- **WHEN** an operator duplicates a published hat and changes its name
- **THEN** the new draft has an independent identity, variants, and zero stock without changing the original product

#### Scenario: Preserve a published URL
- **WHEN** an operator renames a previously published product
- **THEN** its existing URL remains valid and its name updates without requiring a new URL

### Requirement: Explicit merchandise variants and exact prices

The system SHALL support up to two operator-named options per product, initially size and color, with individually selectable active variants, unique option combinations, optional editable SKUs, positive integer USD prices, and variant-specific stock. Products with no options SHALL have one default variant. Operator prices SHALL be entered and displayed in dollars with two decimal places, excluding taxes calculated at checkout.

#### Scenario: Two variants of one product
- **WHEN** a hat has small and medium sizes in two colors and a customer selects medium in moss
- **THEN** the selected price, SKU, and availability correspond to that exact combination and the cart can also contain a different size of the same hat

#### Scenario: Product without size options
- **WHEN** an operator creates a physical accessory without any options
- **THEN** it can be priced, stocked, published, and purchased without a customer choosing an artificial size

#### Scenario: Invalid variant or price
- **WHEN** an operator submits duplicate option combinations or a negative, malformed, or sub-cent price
- **THEN** the save is rejected with field-level guidance and preserves the entered form values

### Requirement: Manageable verified photo galleries

The system SHALL accept multiple JPEG, PNG, or WebP photos up to 10 MB each, display upload progress/previews, support keyboard-accessible ordering and cover selection, supply nonempty editable product-based alt text by default for published images, and allow optional variant association. Only verified, orientation-corrected, sanitized images SHALL become publishable. Photo replacement SHALL preserve the previous valid gallery if upload or processing fails.

#### Scenario: Publish a gallery
- **WHEN** an operator uploads three supported photos, optionally customizes alt text, orders them, and chooses a cover
- **THEN** the saved gallery appears in that order with responsive images and the selected cover on public listings

#### Scenario: Unsupported or failed phone upload
- **WHEN** a phone photo has an unsupported format or its upload fails
- **THEN** the operator sees a useful retry/export-to-JPEG message, retains other form values/photos, and the failed image cannot become a published cover

#### Scenario: Image privacy
- **WHEN** an uploaded image contains camera orientation and GPS metadata
- **THEN** published derivatives display upright without exposing location metadata or private originals

### Requirement: Validated publication and immediate storefront updates

The system SHALL require a name, description, category, at least one active valid priced variant, and a verified real cover with alt text before publication. Zero-stock published products SHALL show sold out. Published saves SHALL be atomic and revalidated; invalid changes SHALL retain the prior valid listing. Committed edits SHALL appear on a fresh public request within five seconds without a build or deployment.

#### Scenario: Missing publication content
- **WHEN** an operator attempts to publish an imported placeholder listing without a real photo
- **THEN** publication is rejected with an ordinary-language checklist and the draft remains editable

#### Scenario: Save a published description
- **WHEN** an operator changes the description of a valid published product
- **THEN** a fresh public request within five seconds shows the saved description while existing orders retain their purchase snapshots

#### Scenario: Sold-out publication
- **WHEN** all active variants of a valid published product have zero available stock
- **THEN** the product remains browseable as sold out and no new checkout can purchase it

### Requirement: Retain history when removing merchandise

The system SHALL hide drafts, archived products, and inactive variants from new public purchase flows while retaining historical identities, orders, and audit records. Existing valid reserved sessions SHALL preserve their original terms. Product and variant removal SHALL not physically delete order-referenced records.

#### Scenario: Archive after a sale
- **WHEN** an operator archives a product with a paid order
- **THEN** it disappears from public purchase listings and the operator can still view and fulfill the original order

#### Scenario: Retire a held variant
- **WHEN** an operator deactivates a variant that has an active reserved Checkout Session
- **THEN** new checkouts reject that variant and the existing session retains its reserved quantity and original price

### Requirement: Focused hats storefront

The public storefront SHALL present Hats as its only category and redirect legacy collection category URLs to the hats collection. Product galleries SHALL display one image at a time from initial rendering, with accessible dot navigation and a screen-reader count, without arrows or a thumbnail strip. Fixed size/details SHALL appear with the other product metadata, and selectable piece controls SHALL have horizontal padding.

#### Scenario: Browse photos and hat details
- **WHEN** a shopper opens a hat with multiple photos
- **THEN** one photo is visible, dot controls navigate the gallery, and size/details appear in the metadata table

#### Scenario: Follow a legacy category link
- **WHEN** a shopper visits an art, wearables, adult or child collection URL
- **THEN** the request redirects permanently to the hats collection

### Requirement: Filled product gallery

Images SHALL fill a consistent square frame with no colored padding or rounded corners, preserving the hat through a bottom-aligned cover crop. Dot controls SHALL overlay the image.

#### Scenario: View a product photo
- **WHEN** a shopper views a gallery slide
- **THEN** the photo fills the frame edge to edge and dots appear over the image

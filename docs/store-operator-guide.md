# Good Apollo studio guide

Open `/admin/`. Sign in with `hello@annakahrs.com` or another explicitly approved operator address, open the emailed link on the same browser, then verify your authenticator. `justin@justinkahrs.com` is additionally approved in the local testing environment; enter that email in the sign-in form. Local sign-in mail is in Mailpit at `http://localhost:18025`, rather than your actual inbox. First-time enrollment shows a QR code, the Base32 manual setup key, and recovery codes. In Google Authenticator, choose **Enter a setup key**, paste the manual setup key, and select **Time based**. Save the recovery codes privately, separately from your phone; each recovery code works once. A verified work session lasts eight hours. Settings can sign out other devices. Sign out on shared devices. If all recovery methods are lost, contact the developer for an audited recovery rather than editing production auth tables casually.

Choose **Set up authenticator** once. The button shows preparation progress, then **Authenticator setup ready** when the QR code, manual setup key, and recovery codes appear. Scan the QR or copy the key and enter it manually in your authenticator; select **Time based**. Store recovery codes, then enter the six-digit code from the authenticator to open the studio. A failed request leaves a visible retry message. After a developer updates this page, refresh it before trying setup again.

## Products and photos

Choose **Products → Add a product**. The main form is for one piece: name, description, optional **Size & details**, and one dollar price such as `58.00`. Describe fixed features such as a large hat's measured diameter, green exterior and red lining here; these do not need selectable variants. The system keeps one stock identity behind the form, generates its SKU, and lets shoppers buy it without choosing an artificial size. Existing optionless products keep their identity, SKU and stock when edited.

Open **A little more detail** for materials, care, category, audience, the automatically created web address, or tax category. Hats and everyone are the defaults. For selectable sizes/colors, open **Offer sizes or colors → Generate sizes and colors**, enter up to two option names and comma-separated values, enter a default price, then **Generate variants**. Review prices and labels; **Option details & stock alerts** holds SKU overrides, option values, low-stock thresholds and active/removal controls. SKUs are generated when blank. Matching variants retain their stock; omitted variants become inactive. Products with choices keep per-variant prices in this section.

Save as **Draft** before adding photos. Upload JPEG, PNG or WebP, up to 10 MB each and 12 photos per product. Export iPhone HEIC photos as JPEG first. Describe each photo so a shopper using a screen reader knows what it shows. Move up/down with keyboard-accessible buttons or Make cover. The first visible photo is the cover. Optionally associate a photo with a variant. Archive placeholders and obsolete photos, then Save photos & order. New photos for a published product are staged/hidden until described and included in a valid photo save.

Count stock through **Manage stock** beside the product's available count (or **Inventory**), then return to the product, select **Published** and Save product. Missing description, real photos/alt text or positive active prices prevents publication. Zero-stock products may be published as sold out. **Draft** removes a listing from the public shop. **Archived** retains product/order history. **Duplicate as a draft** copies editable product content with independent identity and zero stock. Web addresses stay fixed after first publication.

Edits update the shop on a fresh request without a deployment. Validation errors retain the form. Restore unsaved entries is available after a reload in the same browser tab. If another tab saved first, the stale version is rejected: keep your desired text, reload the current product and deliberately reapply it. When verification expires, use the verification link in a new tab, return and retry the same form. Never interpret a failed save as success.

## Stock

**Unsold** is stock still eligible for sale, excluding paid orders awaiting packing. **Held in checkout** is reserved stock. **Available** is unsold minus held. Keep paid pieces in a separate packing area when counting unsold units.

- New batch: Add new stock; reason “New batch, date”.
- In-person sale: Remove stock; reason “In-person sale, event/date”.
- Consignment: Remove pieces when they leave sellable studio stock; record the stockist/reason. Add back only physically returned sellable pieces.
- Damage: Remove stock and explain the damage.
- Count correction: Set actual unsold count after physically counting eligible units.

Review the before/after preview and record a reason. Counts cannot remove protected checkout holds. Low stock uses **available**, including the configured threshold for each variant. Stock history records the actor/time/reason. Do not count a paid order as unsold or subtract stock again when shipping.

For an overdue hold, Settings → Reconcile payments & retry email. A hold is released only after Stripe confirms an unpaid expired session. A checkout timeout, declined card, local timer or cancel-page visit does not establish that payment is impossible. Ask the developer to investigate ledger differences; do not force-release stock.

## Orders

Orders opens to **Paid / To pack**. Open an order to see the purchased item names, variants, quantities, prices and original delivery information. Catalog/settings changes do not rewrite purchases. Print the packing slip, gather/check all items, buy a label directly with the carrier, enter carrier/tracking, then **Mark complete order shipped**. The buyer receives tracking by email. Repeating the same submission does not record another shipment or stock subtraction. Partial shipments are outside the launch workflow.

Pending, processing, canceled, fully refunded, disputed and stock-attention orders cannot be packed. A paid stock exception requires review/refund resolution; do not promise shipment until stock is accounted for. Review Settings for pending/failed notices; a mail failure does not undo an order or shipment.

All sales are final. Tools for reviewed order problems are under Exceptional order changes. Cancel only an unshipped paid order; cancellation changes fulfillment eligibility, not money or stock. Request a full or monetary partial refund with a reason, up to the remaining paid amount. Requested/pending/failed statuses are not successful refunds. Provider Dashboard refunds synchronize during reconciliation. For a payment dispute, follow the Stripe link and respond before its deadline; keep shipment evidence. A dispute does not refund or restock automatically.

Restock only physically present, sellable pieces: an unshipped cancellation still in the studio, or an actually received return. Confirm condition, choose the item/quantity and reason. Prior restocks reduce the eligible quantity. **A lost-parcel refund adds no stock.** Repeating the same restock does not add extra units.

## Newsletter

Newsletter signup is currently closed. The isolated Mautic/gateway rollout is
deployed, but its bounded internal acceptance checks have not run. Do not turn
on `NEWSLETTER_ENABLED` or `NEWSLETTER_CONFIRMATION_DISPATCH_ENABLED`, import
contacts, or send a test message until the infrastructure operator confirms
those checks and the owner authorizes the test. Keep
`NEWSLETTER_API_URL` and `NEWSLETTER_HMAC_SECRET` only in the protected server
environment; never put them in browser variables or a public deploy preview.
Newsletter consent is separate from checkout and customer accounts. A subscriber
must confirm from the email link before joining the Good Apollo audience. The
preference page and one-click unsubscribe stop Good Apollo newsletter messages
only; order, shipment, sign-in and support email remain separate. Never add a
previous Senna outreach contact or another person's address without that
person's Good Apollo consent.

## Settings, exports and help

Settings contains shipping dollars, processing wording, automatic tax and its verification decision. Defaults: $6.95 U.S. shipping including Alaska/Hawaii, processing in 3–5 business days. Verify the actual Stripe tax configuration and product classifications before enabling sales. Settings changes affect new checkouts only.

Catalog, stock and order CSV exports require verified access and escape spreadsheet formulas. Treat order exports and packing slips as private customer records. History retains changes and reasons. See `docs/store-operations.md` for developer recovery and the launch checklist for outstanding owner inputs. Developer support contact/backup operator must be completed at launch.

Primary-operator acceptance remains to be observed with the owner's wife: independently create/publish in ten minutes, edit in two, adjust stock in five, and pack in five, on phone and desktop/keyboard. Automated browser tests do not substitute for that observation.

## Studio lists and settings

Products shows each cover photo, visibility, dollar price and available quantity across active stock identities. A single fixed piece does not need a variant choice. Use Find and Show to narrow a list, or its export link to download records. Inventory separates Available to sell, Held in checkout and Unsold total. Open Record a stock change only when counting a batch or making a correction; every change still needs a reason. How the counts work explains the reservation rules.

Orders starts with Paid / To pack, and offers Needs attention and All orders. Empty queues explain what will appear there. Open a paid order for immutable purchased pieces, delivery/totals and the full-order packing/tracking workflow. Exceptional refund/cancel/restock actions remain folded. Settings puts flat U.S. shipping and processing time together; changes affect future checkouts only. Tax configuration stays expanded while verification is missing. Store health and account controls remain available beside the settings, with a daily guide below.

The [narrated studio walkthrough](studio-walkthrough.md) uses the supplied hat photo and Justin/LuxTTS narration. It demonstrates local demo merchandise, real empty order queues and settings saves; its demo merchandise is archived and settings restored. It does not establish hosted Stripe payment, production readiness or independent operator acceptance.

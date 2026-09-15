# Vercel deployment and GoDaddy DNS

Configured September 8, 2026.

- Vercel project: `good-apollo-goods` in `justinkahrs-projects`
- Working production URL: https://good-apollo-goods.vercel.app/
- Primary domain: https://goodapollogoods.com/
- Redirect: `www.goodapollogoods.com` → `goodapollogoods.com` (HTTP 308)
- Domains are attached and verified for use by this Vercel project. DNS still needs to point to Vercel.

## Continuous deployment

Connected September 15, 2026.

- GitHub repository: `justinkahrs/good-apollo-goods`
- Production branch: `main`
- Every push to `main` triggers a Vercel production deployment.

## GoDaddy records

Open GoDaddy Domain Portfolio → **goodapollogoods.com** → **DNS**. Keep the existing GoDaddy nameservers (`ns21.domaincontrol.com` and `ns22.domaincontrol.com`).

Replace the existing website records with these values returned by Vercel for this project:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `216.198.79.1` | 1 hour |
| A | `@` | `64.29.17.1` | 1 hour |
| CNAME | `www` | `b753e17f3a06fa4b.vercel-dns-017.com` | 1 hour |

Edit the two existing apex A records, currently `76.223.105.230` and `13.248.243.5`, to use the two Vercel values above. Edit the existing `www` CNAME, currently `goodapollogoods.com`, to the hostname above. Do not leave the parking IPs alongside the new records. Preserve unrelated email and verification records.

No ownership TXT record was requested by Vercel. Both A values are preferred Vercel targets; its API also allows using only one preferred IP.

Vercel will validate DNS and issue HTTPS certificates after the records propagate. GoDaddy says this usually takes effect within an hour, but can take up to 48 hours globally. The Vercel-hosted URL works during this process.

## Validation completed

- Vercel production deployment reached `READY` after Astro type checking and static build succeeded.
- Home, design-system, and a sample-product route returned HTTP 200.
- A nonexistent route returned the custom HTTP 404 page.
- Canonical URLs use `https://goodapollogoods.com`.
- Sample content remains marked `noindex, nofollow` pending launch.

## References

- [GoDaddy: add or edit an A record](https://www.godaddy.com/help/add-or-edit-an-a-record-42546)
- [GoDaddy: edit a CNAME record](https://www.godaddy.com/help/edit-a-cname-record-19237)
- [Vercel: set up a custom domain](https://vercel.com/docs/domains/set-up-custom-domain)

Recheck Vercel's Domain Settings if configuring DNS at a later date; provider recommendations can change.

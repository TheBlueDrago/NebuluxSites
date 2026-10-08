# Nebulux Sites

People tell us the website they want, pay, and we build it.

- `public/`: the pages (home, account with sign-up/log-in and ordering, admin)
- `src/worker.js`: the API (accounts with emailed codes, orders, admin). Packages and prices are at the top.
- Deploy: `npx wrangler deploy` (Cloudflare Worker `nebuluxsites`, D1 database `nebulux-sites`)

Secrets (Cloudflare → Worker → Settings → Variables and secrets): `RESEND_API_KEY`, `ADMIN_KEY`, optional `OWNER_EMAIL`.

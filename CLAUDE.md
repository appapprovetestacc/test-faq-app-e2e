# Test FAQ App — FAQ

> Hand-built Shopify app, delivered ready-to-iterate. Live at https://test-faq-app-e2e.appapprove.app
>
> **Project facts:**
> - Blueprint: FAQ
> - Hosting: Cloudflare Worker (yours, you own it)
> - Repo: this one (yours, you own it)
> - Initial MVP: hand-built by AppApprove. Iterations from here are yours to drive.

## Architecture

- **Framework:** Remix on Cloudflare Workers
- **DB:** Cloudflare D1 (binding: `env.D1`)
- **Storage:** Cloudflare R2 (where declared in `wrangler.toml`)
- **Auth:** Shopify embedded admin + App Bridge React
- **UI:** Polaris React + App Bridge React (NOT raw HTML/CSS)
- **Deploy:** Push to `main` → GitHub Actions `deploy.yml` → `wrangler deploy`
- **Cron triggers:** see `wrangler.toml [triggers]`

## Domain

Manage categorized FAQ entries, publish as a dedicated /apps/faq page or embed via theme-app-embed accordion on any page. Client-side search. Per-question views + helpful/unhelpful votes.

**Shipped surfaces:**
- Categorized FAQ entries with rich-text answers (sanitized)
- Dedicated FAQ page at /apps/faq + embeddable accordion block
- Client-side search across questions
- Per-question analytics (views + helpful/unhelpful votes)
- Drag-to-reorder categories + entries

## Iteration cookbook

Open this repo in Claude Code or Cursor and try one of these:

- *"add a CSV import for bulk FAQ entries"*
- *"add a search bar to the storefront FAQ page"*
- *"add a 'helpful?' thumbs-up/down on each FAQ answer with analytics"*

## Conventions

- Polaris React + App Bridge React (no raw HTML/CSS)
- Every admin route wraps in `<Page>` with title + `primaryAction`
- All currency stored as integer cents
- Drizzle migrations live in `drizzle/migrations/` — add a `meta/_journal.json` entry for every new SQL file (otherwise Drizzle silently skips it)
- Don't use Vite-style `?raw` imports for SQL/text files — Cloudflare Workers esbuild has no loader configured; inline migration SQL as TypeScript const strings
- Webhooks subscribed in `shopify.app.toml [[webhooks.subscriptions]]` + handlers in `app/routes/webhooks.<topic>.ts`

## Don't

- Don't modify `deploy.yml` structure, `wrangler.toml` schema, or `load-context.ts` beyond adding new bindings
- Don't replace AppApprove scaffold/auth helpers — extend them
- Don't introduce a new top-level dependency if a similar one already exists in `package.json` (check first)
- Don't break the existing `pnpm tsc + pnpm test` gates — both must stay green for deploy to succeed

## Deploy

```bash
git push origin main
```

→ `deploy.yml` runs install + tsc + test + `wrangler deploy`. Live URL is `test-faq-app-e2e.appapprove.app`.

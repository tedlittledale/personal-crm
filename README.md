# People Notes (Personal CRM)

A personal CRM for managing contacts with AI-powered voice note ingestion, natural language search, and Telegram bot integration. Built with Next.js 16, deployed on Vercel.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

Copy the required env vars into `.env.local`:

```
DATABASE_URL
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_WEBHOOK_SECRET
ANTHROPIC_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_USERNAME
CRON_SECRET
```

Optional: `APP_URL` / `NEXT_PUBLIC_APP_URL` (falls back to `VERCEL_PROJECT_PRODUCTION_URL`)

## Feature Development Workflow

### 1. Create a feature branch

```bash
git checkout -b feature/my-feature
```

### 2. Develop locally against staging

```bash
npm run dev:staging
```

This runs the dev server against the staging database, keeping production data safe.

### 3. Schema changes (if any)

```bash
# Edit src/db/schema.ts, then:
npx drizzle-kit generate          # generate migration
npm run db:migrate:staging        # apply to staging first
npm run dev:staging               # verify it works
```

### 4. Push & preview

```bash
git push -u origin feature/my-feature
```

Vercel preview deployments automatically use the staging database.

### 5. Merge to main

After merging, the production deployment uses the production database. Run migrations in prod:

```bash
npx drizzle-kit migrate
```

### 6. Periodically re-sync staging

When staging data gets stale or you want a fresh copy of prod:

```bash
npm run db:sync-staging
```

## Staging Environment

A separate Supabase project is used for staging/preview deployments so that migrations and features can be tested before hitting production.

### Setup

1. Copy `.env.staging.template` to `.env.staging` and fill in the staging database password and other keys from `.env.local`
2. Add `PROD_DATABASE_URL_DIRECT` to `.env.local` (your production direct connection string, port 5432)
3. Install PostgreSQL client tools: `brew install libpq`

### Staging Commands

| Command | Description |
|---|---|
| `npm run dev:staging` | Start dev server against staging DB |
| `npm run db:migrate:staging` | Run pending migrations on staging |
| `npm run db:push:staging` | Push schema directly to staging (skip migrations) |
| `npm run db:sync-staging` | Copy production data to staging (pg_dump/psql) |

### Vercel Configuration

- `DATABASE_URL` scoped to **Production** — production pooler URL (port 6543)
- `DATABASE_URL` scoped to **Preview** — staging pooler URL (port 6543)

### Env Files

| File | Purpose |
|---|---|
| `.env.local` | Production database + `PROD_DATABASE_URL_DIRECT` |
| `.env.staging` | Staging database + `STAGING_DATABASE_URL_DIRECT` |
| `.env.staging.template` | Template for `.env.staging` (committed to repo) |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npx drizzle-kit generate` | Generate a migration from schema changes |
| `npx drizzle-kit migrate` | Run pending migrations (production) |
| `npx drizzle-kit push` | Push schema changes directly to the database |

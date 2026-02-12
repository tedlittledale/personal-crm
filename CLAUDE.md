# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- `npm run dev` — Start Next.js dev server (http://localhost:3000)
- `npm run build` — Production build
- `npm run lint` — Run ESLint
- `npx drizzle-kit generate` — Generate a new migration from schema changes
- `npx drizzle-kit push` — Push schema changes directly to the database
- `npx drizzle-kit migrate` — Run pending migrations

Environment variables are stored in `.env.local` (used by both Next.js and drizzle.config.ts).

### Staging Environment

A separate Supabase project is used for staging/preview deployments. Vercel preview branches automatically use the staging database.

**Env files:**
- `.env.local` — Production database + `PROD_DATABASE_URL_DIRECT` (direct connection for pg_dump)
- `.env.staging` — Staging database (copy `.env.staging.template` and fill in values)

**Staging commands:**
- `npm run dev:staging` — Start dev server against staging DB
- `npm run db:push:staging` — Push schema changes to staging
- `npm run db:migrate:staging` — Run pending migrations on staging
- `npm run db:sync-staging` — Sync production data to staging (pg_dump/psql)

## Architecture

**Personal CRM ("People Notes")** — A Next.js 16 app for managing contacts with AI-powered voice note ingestion, natural language search, and Telegram bot integration. Deployed on Vercel.

### Tech Stack
- **Framework:** Next.js 16 with App Router, React 19, TypeScript (strict)
- **Database:** PostgreSQL via Drizzle ORM (`postgres` client with `prepare: false` for serverless)
- **Auth:** Clerk (`@clerk/nextjs`) — middleware in `src/middleware.ts` enforces sessions
- **AI:** Anthropic Claude API (`claude-sonnet-4-20250514`) for extraction and NL queries
- **Messaging:** Telegram Bot API via direct HTTP calls (not grammy classes)
- **Styling:** Tailwind CSS 4
- **Validation:** Zod 4

### Path Alias
`@/*` maps to `./src/*`

### Key Data Flow: Voice Note Ingestion
1. iOS Shortcut sends transcript to `POST /api/ingest` (authenticated via `x-api-key` header)
2. Claude tidies the transcript and extracts structured person data (`src/lib/extract.ts`)
3. Extracted data stored in `pendingReviews` table with 7-day expiry
4. User reviews and confirms at `/review/[id]`, which saves to `people` table

### Key Data Flow: Natural Language Search
1. Query hits `GET /api/search?q=...` (or Telegram bot)
2. Claude parses the natural language query into structured filters/sort (`src/lib/nl-query.ts`)
3. Filters applied against user's contacts, results returned

### Database Schema (`src/db/schema.ts`)
Three tables: `users` (Clerk user ID + API key + Telegram link), `people` (contacts with personal/professional fields), `pendingReviews` (temporary voice transcript extractions)

### API Authentication Patterns
- **Most routes:** Clerk session via `auth()` from `@clerk/nextjs/server`
- **`/api/ingest`:** Custom `x-api-key` header (matches user's `apiKey` field)
- **`/api/webhooks/clerk`:** Svix signature verification
- **`/api/telegram/webhook`:** Open (Telegram handles security)
- **`/api/cron/*`:** Bearer token matching `CRON_SECRET` env var

### Messaging Abstraction (`src/lib/messaging/`)
Pluggable `MessagingProvider` interface with Telegram implementation. Designed to swap in WhatsApp/Twilio later. Used for weekly summary cron and Telegram bot interactions.

## Required Environment Variables

```
DATABASE_URL, CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
CLERK_WEBHOOK_SECRET, ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN,
TELEGRAM_BOT_USERNAME, CRON_SECRET
```

Optional: `APP_URL` / `NEXT_PUBLIC_APP_URL` (falls back to `VERCEL_PROJECT_PRODUCTION_URL`)

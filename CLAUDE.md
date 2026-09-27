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
Tables: `users` (Clerk user ID + API key + Telegram link), `people` (contacts with personal/professional fields), `pendingReviews` (temporary voice transcript extractions), `reminders` (follow-up reminders sent via Telegram), `pendingActions` (agent-proposed writes awaiting a "yes"), `chatMessages` (recent Telegram conversation history replayed to the agent so follow-up replies keep context; pruned by age and count), `giftIdeas` (present ideas per contact, filed under an occasion type + year)

### Telegram Agent (`src/lib/agent/`)
`crm-agent.ts` runs a tool-calling agent per inbound message. It loads the chat's recent history from `chatMessages` (`conversation.ts`), sends it ahead of the new message, and appends the turn afterwards. Write tools stage a `pendingActions` row that the webhook applies on the next "yes". `/new` or `/reset` in Telegram clears both.

### Gift Ideas (`src/lib/gifts.ts`, `src/lib/gift-occasions.ts`)
Each idea is filed under `birthday`, `christmas` or `other` plus a year; with no occasion given it goes to the contact's next birthday or Christmas, whichever is sooner. The live list is every `idea` (whatever year it was filed under) plus `bought` gifts whose occasion hasn't passed; `given` and past `bought` gifts form the per-occasion history. The Telegram agent saves ideas immediately (`addGiftIdeas`, with `undoGiftIdeas` for 30 minutes after) but status/occasion changes go through a pending action. Shown on the person page and at `/gifts`. The birthday-reminder cron also sends gift nudges built by `src/lib/gift-nudges.ts` (14 days before a birthday, a Christmas roundup on 25 Nov, and "which did you give?" the day after a birthday and on 27 Dec), only for contacts with at least one gift idea. Nudges are recorded in `chatMessages` behind `SCHEDULED_MESSAGE_MARKER` so the agent reads the reply in context.

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

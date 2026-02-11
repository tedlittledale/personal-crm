# Weekly Summary Feature Plan

## Overview
Add per-user configurable weekly summary delivery (default: Sunday 8pm), a "Send test summary" button in settings, and Vercel cron scheduling.

## What already exists
- `src/app/api/cron/weekly-summary/route.ts` — complete logic for building summaries (new contacts + upcoming birthdays) and sending via Telegram. Currently sends to all linked users on any cron trigger with no time/day logic.
- `src/lib/messaging/telegram.ts` — `sendMessage` / `sendMarkdown` helpers.
- `src/app/settings/page.tsx` — Telegram linking UI (Notifications section).
- `src/db/schema.ts` — `users` table with `telegramChatId`, `people` table with `birthdayMonth`/`birthdayDay`/`createdAt`.

## Changes

### 1. Database schema — add weekly summary columns to `users`

**File: `src/db/schema.ts`**
Add three columns to the `users` table:
- `weeklySummaryHour` — `integer("weekly_summary_hour").default(20).notNull()` (0-23, default 20 = 8pm)
- `weeklySummaryTimezone` — `text("weekly_summary_timezone").default("America/New_York").notNull()` (IANA timezone string)
- `lastWeeklySummaryAt` — `timestamp("last_weekly_summary_at")` (nullable, tracks when last sent to prevent duplicates)

**File: `drizzle/0003_add_weekly_summary_settings.sql`**
```sql
ALTER TABLE "users" ADD COLUMN "weekly_summary_hour" integer NOT NULL DEFAULT 20;
ALTER TABLE "users" ADD COLUMN "weekly_summary_timezone" text NOT NULL DEFAULT 'America/New_York';
ALTER TABLE "users" ADD COLUMN "last_weekly_summary_at" timestamp;
```

### 2. Update cron route — per-user time matching

**File: `src/app/api/cron/weekly-summary/route.ts`**

Refactor the existing `GET` handler:
- Run the cron every hour (configured in `vercel.json`).
- For each user with a linked Telegram, compute the current day/hour in their `weeklySummaryTimezone`.
- Only send if it's **Sunday** and the hour matches their `weeklySummaryHour`.
- After sending, update `lastWeeklySummaryAt` to prevent duplicate sends within the same hour window.
- Extract the summary-building logic (`getUpcomingBirthdays`, `buildWeeklySummary`) into a shared helper so the test endpoint can reuse it.

**New file: `src/lib/weekly-summary.ts`**
Extract `getUpcomingBirthdays` and `buildWeeklySummary` from the cron route into this shared module so both the cron and test endpoints can use it.

### 3. New API routes for settings

**File: `src/app/api/settings/weekly-summary/route.ts`**
- `GET` — returns `{ hour, timezone }` for the authenticated user.
- `PUT` — accepts `{ hour, timezone }` and updates the user record. Validates hour is 0-23 and timezone is a valid IANA timezone.

**File: `src/app/api/settings/weekly-summary/test/route.ts`**
- `POST` — generates and sends a real weekly summary to the authenticated user's linked Telegram immediately (regardless of day/time). Returns `{ ok: true }` or an error if Telegram isn't linked. Reuses the shared `buildWeeklySummary` / `getUpcomingBirthdays` logic.

### 4. Settings page UI updates

**File: `src/app/settings/page.tsx`**

Add a **"Weekly Summary"** subsection inside the existing Notifications section (shown only when Telegram is linked):

- **Time picker**: Dropdown for hour (12-hour format with AM/PM) and timezone dropdown (common IANA timezones). Pre-populated with the user's current settings (fetched from GET endpoint). Auto-saves on change via PUT.
- **"Send test summary now"** button: Calls the test endpoint. Shows loading state and success/error feedback. Disabled if Telegram isn't linked.
- **Last sent**: Display `lastWeeklySummaryAt` if available (e.g., "Last sent: Feb 9, 2026 at 8:00 PM").

### 5. Vercel cron configuration

**File: `vercel.json`**
```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-summary",
      "schedule": "0 * * * *"
    }
  ]
}
```
Runs every hour. The route itself checks whether it's Sunday at the user's preferred time.

## File change summary

| File | Action |
|---|---|
| `src/db/schema.ts` | Modify — add 3 columns to `users` |
| `drizzle/0003_add_weekly_summary_settings.sql` | Create — migration |
| `src/lib/weekly-summary.ts` | Create — shared summary builder |
| `src/app/api/cron/weekly-summary/route.ts` | Modify — add per-user time check, use shared helpers |
| `src/app/api/settings/weekly-summary/route.ts` | Create — GET/PUT for summary settings |
| `src/app/api/settings/weekly-summary/test/route.ts` | Create — POST to trigger test summary |
| `src/app/settings/page.tsx` | Modify — add summary schedule UI + test button |
| `vercel.json` | Create — cron schedule |

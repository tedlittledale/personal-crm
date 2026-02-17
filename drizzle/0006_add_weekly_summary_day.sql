ALTER TABLE "users" ADD COLUMN "weekly_summary_day" integer NOT NULL DEFAULT 0;
-- 0 = Sunday, 1 = Monday, …, 6 = Saturday

-- Fix existing users still on the old America/New_York default from migration 0003.
-- Migration 0004 changed the column default to Europe/London but did not backfill
-- existing rows, so any user created before 0004 still has America/New_York.
UPDATE "users" SET "weekly_summary_timezone" = 'Europe/London' WHERE "weekly_summary_timezone" = 'America/New_York';

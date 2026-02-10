ALTER TABLE "users" ADD COLUMN "weekly_summary_hour" integer NOT NULL DEFAULT 20;
ALTER TABLE "users" ADD COLUMN "weekly_summary_timezone" text NOT NULL DEFAULT 'America/New_York';
ALTER TABLE "users" ADD COLUMN "last_weekly_summary_at" timestamp;

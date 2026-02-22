ALTER TABLE "users" ADD COLUMN "birthday_reminders_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_birthday_reminder_at" timestamp;
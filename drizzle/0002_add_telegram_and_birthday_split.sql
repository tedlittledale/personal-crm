-- Users: add telegram and phone fields
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_link_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_telegram_chat_id_unique" UNIQUE("telegram_chat_id");--> statement-breakpoint

-- People: add email and phone fields
ALTER TABLE "people" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "phone" text;--> statement-breakpoint

-- People: replace birthday (date) with birthdayMonth and birthdayDay (integers)
-- Migrate existing data first
ALTER TABLE "people" ADD COLUMN "birthday_month" integer;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "birthday_day" integer;--> statement-breakpoint
UPDATE "people" SET "birthday_month" = EXTRACT(MONTH FROM "birthday")::integer, "birthday_day" = EXTRACT(DAY FROM "birthday")::integer WHERE "birthday" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "people" DROP COLUMN IF EXISTS "birthday";

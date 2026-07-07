CREATE TABLE "pending_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"action_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"person_id" uuid,
	"text" text NOT NULL,
	"due_at" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_actions_chat_id_idx" ON "pending_actions" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "reminders_user_id_idx" ON "reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminders_status_due_at_idx" ON "reminders" USING btree ("status","due_at");
CREATE TABLE "gift_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"idea" text NOT NULL,
	"notes" text,
	"occasion_type" text NOT NULL,
	"occasion_label" text,
	"occasion_year" integer NOT NULL,
	"status" text DEFAULT 'idea' NOT NULL,
	"status_changed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gift_ideas" ADD CONSTRAINT "gift_ideas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_ideas" ADD CONSTRAINT "gift_ideas_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_ideas_user_id_idx" ON "gift_ideas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gift_ideas_person_id_idx" ON "gift_ideas" USING btree ("person_id");
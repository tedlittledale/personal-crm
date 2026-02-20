import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  integer,
} from "drizzle-orm/pg-core";

// Users table - synced from Clerk via webhook
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user ID
  apiKey: text("api_key").notNull().unique(),
  phone: text("phone"), // for future WhatsApp/Twilio
  telegramChatId: text("telegram_chat_id").unique(),
  telegramLinkToken: text("telegram_link_token"),
  weeklySummaryDay: integer("weekly_summary_day").default(0).notNull(), // 0=Sunday, 1=Monday, …, 6=Saturday
  weeklySummaryHour: integer("weekly_summary_hour").default(20).notNull(),
  weeklySummaryMinute: integer("weekly_summary_minute").default(0).notNull(), // 0 or 30
  weeklySummaryTimezone: text("weekly_summary_timezone")
    .default("Europe/London")
    .notNull(),
  lastWeeklySummaryAt: timestamp("last_weekly_summary_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// People - the core entity, one per person you've met
export const people = pgTable(
  "people",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    company: text("company"),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    personalDetails: text("personal_details"),
    notes: text("notes"),
    source: text("source"),
    birthdayMonth: integer("birthday_month"), // 1-12
    birthdayDay: integer("birthday_day"), // 1-31
    children: text("children"),
    aiSummary: text("ai_summary"),
    lastChangeDescription: text("last_change_description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("people_user_id_idx").on(table.userId),
    index("people_name_idx").on(table.name),
  ]
);

// Pending reviews - temporary holding area for voice note transcripts
// before the user confirms and saves as a Person record
export const pendingReviews = pgTable(
  "pending_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    transcript: text("transcript").notNull(),
    extractedData: jsonb("extracted_data"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("pending_reviews_user_id_idx").on(table.userId)]
);

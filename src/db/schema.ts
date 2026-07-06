import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  integer,
  boolean,
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
  birthdayRemindersEnabled: boolean("birthday_reminders_enabled")
    .default(true)
    .notNull(),
  lastBirthdayReminderAt: timestamp("last_birthday_reminder_at"),
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
    address: text("address"),
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

// Reminders - user-created follow-up reminders delivered via Telegram
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "set null",
    }), // optional link to the contact the reminder is about
    text: text("text").notNull(),
    dueAt: timestamp("due_at").notNull(),
    status: text("status").default("pending").notNull(), // 'pending' | 'sent'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    sentAt: timestamp("sent_at"),
  },
  (table) => [
    index("reminders_user_id_idx").on(table.userId),
    index("reminders_status_due_at_idx").on(table.status, table.dueAt),
  ]
);

// Pending actions - proposed write operations from the Telegram agent that
// await user confirmation. Bridges the AI SDK approval pattern across the
// stateless webhook: the agent proposes a write, and the next affirmative
// message applies it. At most one active action per chat.
export const pendingActions = pgTable(
  "pending_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    chatId: text("chat_id").notNull(),
    actionType: text("action_type").notNull(), // 'createContact' | 'updateContact' | 'createReminder'
    payload: jsonb("payload").notNull(), // validated tool args to apply on confirmation
    summary: text("summary").notNull(), // human-readable description shown to the user
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("pending_actions_chat_id_idx").on(table.chatId)]
);

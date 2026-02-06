import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  date,
} from "drizzle-orm/pg-core";

// Users table - synced from Clerk via webhook
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user ID
  apiKey: text("api_key").notNull().unique(),
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
    personalDetails: text("personal_details"),
    notes: text("notes"),
    source: text("source"),
    birthday: date("birthday"),
    children: text("children"),
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

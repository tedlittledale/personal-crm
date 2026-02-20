import { db } from "@/db";
import { people } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Find contacts whose birthday falls within the next N days.
 * Handles month boundaries (e.g. Dec 28 -> Jan 3).
 */
export async function getUpcomingBirthdays(
  userId: string,
  from: Date,
  days: number
): Promise<(typeof people.$inferSelect)[]> {
  // Get all contacts with birthdays set
  const allWithBirthdays = await db
    .select()
    .from(people)
    .where(
      and(
        eq(people.userId, userId),
        isNotNull(people.birthdayMonth),
        isNotNull(people.birthdayDay)
      )
    );

  // Filter in application code for date range (handles year wrap)
  const upcoming: (typeof people.$inferSelect)[] = [];

  for (let d = 0; d < days; d++) {
    const checkDate = new Date(from.getTime() + d * 24 * 60 * 60 * 1000);
    const checkMonth = checkDate.getMonth() + 1; // 1-indexed
    const checkDay = checkDate.getDate();

    for (const person of allWithBirthdays) {
      if (
        person.birthdayMonth === checkMonth &&
        person.birthdayDay === checkDay
      ) {
        upcoming.push(person);
      }
    }
  }

  return upcoming;
}

export function buildWeeklySummary(
  newContacts: (typeof people.$inferSelect)[],
  upcomingBirthdays: (typeof people.$inferSelect)[],
  updatedContacts: (typeof people.$inferSelect)[] = []
): string {
  const sections: string[] = [];

  sections.push("📋 Weekly People Notes Summary\n");

  if (newContacts.length > 0) {
    sections.push(`🆕 New Contacts This Week (${newContacts.length}):`);
    for (const p of newContacts) {
      const details = [p.role, p.company].filter(Boolean).join(" at ");
      const source = p.source ? ` — ${p.source}` : "";
      sections.push(`  • ${p.name}${details ? ` (${details})` : ""}${source}`);
    }
    sections.push("");
  }

  if (updatedContacts.length > 0) {
    sections.push(`✏️ Recently Updated (${updatedContacts.length}):`);
    for (const p of updatedContacts) {
      const details = [p.role, p.company].filter(Boolean).join(" at ");
      const note = p.notes
        ? ` — ${p.notes.length > 100 ? p.notes.slice(0, 100) + "…" : p.notes}`
        : p.aiSummary
          ? ` — ${p.aiSummary}`
          : "";
      sections.push(`  • ${p.name}${details ? ` (${details})` : ""}${note}`);
    }
    sections.push("");
  }

  if (upcomingBirthdays.length > 0) {
    sections.push(`🎂 Upcoming Birthdays (${upcomingBirthdays.length}):`);
    for (const p of upcomingBirthdays) {
      const monthName = p.birthdayMonth
        ? MONTH_NAMES[p.birthdayMonth]
        : "?";
      sections.push(`  • ${p.name} — ${monthName} ${p.birthdayDay}`);
    }
    sections.push("");
  }

  sections.push(
    "💬 Reply to this message to ask questions about your contacts."
  );

  return sections.join("\n");
}

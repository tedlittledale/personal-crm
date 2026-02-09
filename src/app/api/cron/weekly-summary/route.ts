import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, people } from "@/db/schema";
import { eq, and, gte, isNotNull } from "drizzle-orm";
import { getMessagingProvider } from "@/lib/messaging";

/**
 * GET /api/cron/weekly-summary
 * Sends a weekly summary to all users with linked Telegram accounts.
 * Protected by CRON_SECRET via Authorization: Bearer header.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messaging = getMessagingProvider();
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Find all users with telegram linked
  const linkedUsers = await db
    .select()
    .from(users)
    .where(isNotNull(users.telegramChatId));

  let sent = 0;
  let errors = 0;

  for (const user of linkedUsers) {
    if (!user.telegramChatId) continue;

    try {
      // Get contacts added in the last 7 days
      const newContacts = await db
        .select()
        .from(people)
        .where(
          and(eq(people.userId, user.id), gte(people.createdAt, oneWeekAgo))
        );

      // Get contacts with upcoming birthdays (next 7 days)
      const upcomingBirthdays = await getUpcomingBirthdays(user.id, now, 7);

      // Skip if nothing to report
      if (newContacts.length === 0 && upcomingBirthdays.length === 0) {
        continue;
      }

      // Build the message
      const message = buildWeeklySummary(newContacts, upcomingBirthdays);

      await messaging.sendMessage(user.telegramChatId, message);
      sent++;
    } catch (err) {
      console.error(`Failed to send summary to user ${user.id}:`, err);
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    usersChecked: linkedUsers.length,
    sent,
    errors,
  });
}

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
 * Handles month boundaries (e.g. Dec 28 → Jan 3).
 */
async function getUpcomingBirthdays(
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

function buildWeeklySummary(
  newContacts: (typeof people.$inferSelect)[],
  upcomingBirthdays: (typeof people.$inferSelect)[]
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

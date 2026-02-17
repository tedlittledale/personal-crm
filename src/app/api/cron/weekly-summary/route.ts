import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, people } from "@/db/schema";
import { eq, and, gte, isNotNull } from "drizzle-orm";
import { getMessagingProvider } from "@/lib/messaging";
import { getUpcomingBirthdays, buildWeeklySummary } from "@/lib/weekly-summary";

/** Extract the current day-of-week (0=Sun) and hour in a given IANA timezone. */
function getUserLocalTime(
  date: Date,
  timezone: string
): { dayOfWeek: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);

  // hour12:false can return 24 for midnight in some locales
  const hour = get("hour") % 24;
  // Reconstruct a date from the parts to derive day-of-week
  const localDate = new Date(get("year"), get("month") - 1, get("day"));
  return { dayOfWeek: localDate.getDay(), hour };
}

/**
 * GET /api/cron/weekly-summary
 * Runs every hour via Vercel cron. For each user with a linked Telegram,
 * checks if it's the user's chosen day/hour in their timezone.
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
  let skipped = 0;
  let errors = 0;

  for (const user of linkedUsers) {
    if (!user.telegramChatId) continue;

    try {
      // Check if it's the right day/hour in the user's timezone
      const { dayOfWeek, hour: userHour } = getUserLocalTime(
        now,
        user.weeklySummaryTimezone
      );

      if (dayOfWeek !== user.weeklySummaryDay || userHour !== user.weeklySummaryHour) {
        skipped++;
        continue;
      }

      // Prevent duplicate sends within the same hour window
      if (user.lastWeeklySummaryAt) {
        const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        if (user.lastWeeklySummaryAt > hourAgo) {
          skipped++;
          continue;
        }
      }

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
        skipped++;
        continue;
      }

      // Build and send the message
      const message = buildWeeklySummary(newContacts, upcomingBirthdays);
      await messaging.sendMessage(user.telegramChatId, message);

      // Update lastWeeklySummaryAt
      await db
        .update(users)
        .set({ lastWeeklySummaryAt: now })
        .where(eq(users.id, user.id));

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
    skipped,
    errors,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { getMessagingProvider } from "@/lib/messaging";
import { getWeeklySummaryData, buildWeeklySummary } from "@/lib/weekly-summary";

/** Extract the current day-of-week (0=Sun), hour, and minute in a given IANA timezone. */
function getUserLocalTime(
  date: Date,
  timezone: string
): { dayOfWeek: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);

  // hour12:false can return 24 for midnight in some locales
  const hour = get("hour") % 24;
  const minute = get("minute");
  // Reconstruct a date from the parts to derive day-of-week
  const localDate = new Date(get("year"), get("month") - 1, get("day"));
  return { dayOfWeek: localDate.getDay(), hour, minute };
}

/**
 * GET /api/cron/weekly-summary
 * Runs every hour via Vercel cron. For each user with a linked Telegram,
 * checks if it's the user's chosen day/hour in their timezone.
 * Protected by CRON_SECRET via Authorization: Bearer header.
 */
export async function GET(req: NextRequest) {
  console.log("[weekly-summary cron] Invoked at", new Date().toISOString());

  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[weekly-summary cron] CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("[weekly-summary cron] Unauthorized - auth header mismatch");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messaging = getMessagingProvider();
  const now = new Date();

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
      // Check if it's the right day/hour/minute in the user's timezone
      const { dayOfWeek, hour: userHour, minute: userMinute } = getUserLocalTime(
        now,
        user.weeklySummaryTimezone
      );

      // Round current minute to the nearest 30-min slot (0 or 30)
      const currentSlot = userMinute < 30 ? 0 : 30;

      console.log(`[weekly-summary cron] User ${user.id}: local time dayOfWeek=${dayOfWeek} hour=${userHour} slot=${currentSlot}, config day=${user.weeklySummaryDay} hour=${user.weeklySummaryHour} minute=${user.weeklySummaryMinute} tz=${user.weeklySummaryTimezone}`);

      if (
        dayOfWeek !== user.weeklySummaryDay ||
        userHour !== user.weeklySummaryHour ||
        currentSlot !== user.weeklySummaryMinute
      ) {
        console.log(`[weekly-summary cron] User ${user.id}: skipped (schedule mismatch)`);
        skipped++;
        continue;
      }

      // Prevent duplicate sends within the same 30-minute window
      if (user.lastWeeklySummaryAt) {
        const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
        if (user.lastWeeklySummaryAt > thirtyMinsAgo) {
          console.log(`[weekly-summary cron] User ${user.id}: skipped (duplicate prevention, last sent ${user.lastWeeklySummaryAt.toISOString()})`);
          skipped++;
          continue;
        }
      }

      const { newContacts, updatedContacts, upcomingBirthdays } =
        await getWeeklySummaryData(user.id, now);

      // Skip if nothing to report
      if (
        newContacts.length === 0 &&
        updatedContacts.length === 0 &&
        upcomingBirthdays.length === 0
      ) {
        console.log(`[weekly-summary cron] User ${user.id}: skipped (no data to report)`);
        skipped++;
        continue;
      }

      console.log(`[weekly-summary cron] User ${user.id}: sending summary (new=${newContacts.length}, updated=${updatedContacts.length}, birthdays=${upcomingBirthdays.length})`);

      // Build and send the message
      const message = buildWeeklySummary(
        newContacts,
        upcomingBirthdays,
        updatedContacts
      );
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

  console.log(`[weekly-summary cron] Done: checked=${linkedUsers.length} sent=${sent} skipped=${skipped} errors=${errors}`);

  return NextResponse.json({
    ok: true,
    usersChecked: linkedUsers.length,
    sent,
    skipped,
    errors,
  });
}

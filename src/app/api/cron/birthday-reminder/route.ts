import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, people } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getMessagingProvider } from "@/lib/messaging";

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

/** Extract the current hour, month, and day in a given IANA timezone. */
function getUserLocalTime(
  date: Date,
  timezone: string
): { hour: number; minute: number; month: number; day: number } {
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

  const hour = get("hour") % 24;
  const minute = get("minute");
  const month = get("month");
  const day = get("day");

  return { hour, minute, month, day };
}

/**
 * GET /api/cron/birthday-reminder
 * Runs every 30 minutes via Vercel cron. For each user with birthday reminders
 * enabled and a linked Telegram account, checks if it's 9:00 AM in their timezone
 * and sends reminders for contacts whose birthday is today.
 * Protected by CRON_SECRET via Authorization: Bearer header.
 */
export async function GET(req: NextRequest) {
  console.log("[birthday-reminder cron] Invoked at", new Date().toISOString());

  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[birthday-reminder cron] CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("[birthday-reminder cron] Unauthorized - auth header mismatch");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messaging = getMessagingProvider();
  const now = new Date();

  // Find all users with telegram linked and birthday reminders enabled
  const eligibleUsers = await db
    .select()
    .from(users)
    .where(
      and(
        isNotNull(users.telegramChatId),
        eq(users.birthdayRemindersEnabled, true)
      )
    );

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of eligibleUsers) {
    if (!user.telegramChatId) continue;

    try {
      const { hour, minute, month, day } = getUserLocalTime(
        now,
        user.weeklySummaryTimezone
      );

      // Round current minute to nearest 30-min slot
      const currentSlot = minute < 30 ? 0 : 30;

      console.log(`[birthday-reminder cron] User ${user.id}: local time hour=${hour} slot=${currentSlot} month=${month} day=${day} tz=${user.weeklySummaryTimezone}`);

      // Only send at 9:00 AM in the user's timezone
      if (hour !== 9 || currentSlot !== 0) {
        console.log(`[birthday-reminder cron] User ${user.id}: skipped (not 9:00 AM, currently ${hour}:${currentSlot === 0 ? '00' : '30'})`);
        skipped++;
        continue;
      }

      // Prevent duplicate sends within the same 30-minute window
      if (user.lastBirthdayReminderAt) {
        const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
        if (user.lastBirthdayReminderAt > thirtyMinsAgo) {
          console.log(`[birthday-reminder cron] User ${user.id}: skipped (duplicate prevention)`);
          skipped++;
          continue;
        }
      }

      // Find contacts with birthdays today
      const birthdayContacts = await db
        .select()
        .from(people)
        .where(
          and(
            eq(people.userId, user.id),
            eq(people.birthdayMonth, month),
            eq(people.birthdayDay, day)
          )
        );

      if (birthdayContacts.length === 0) {
        console.log(`[birthday-reminder cron] User ${user.id}: skipped (no birthdays today)`);
        skipped++;
        continue;
      }

      console.log(`[birthday-reminder cron] User ${user.id}: sending reminder for ${birthdayContacts.length} birthday(s)`);

      // Build and send the birthday reminder message
      const lines: string[] = [];
      lines.push(`🎂 Birthday Reminder\n`);

      if (birthdayContacts.length === 1) {
        const p = birthdayContacts[0];
        const details = [p.role, p.company].filter(Boolean).join(" at ");
        lines.push(
          `Today is ${p.name}'s birthday!${details ? ` (${details})` : ""}`
        );
      } else {
        lines.push(
          `${birthdayContacts.length} of your contacts have birthdays today!\n`
        );
        for (const p of birthdayContacts) {
          const details = [p.role, p.company].filter(Boolean).join(" at ");
          lines.push(`  • ${p.name}${details ? ` (${details})` : ""}`);
        }
      }

      const monthName = MONTH_NAMES[month];
      lines.push(`\n📅 ${monthName} ${day}`);

      await messaging.sendMessage(user.telegramChatId, lines.join("\n"));

      // Update lastBirthdayReminderAt
      await db
        .update(users)
        .set({ lastBirthdayReminderAt: now })
        .where(eq(users.id, user.id));

      sent++;
    } catch (err) {
      console.error(
        `Failed to send birthday reminder to user ${user.id}:`,
        err
      );
      errors++;
    }
  }

  console.log(`[birthday-reminder cron] Done: checked=${eligibleUsers.length} sent=${sent} skipped=${skipped} errors=${errors}`);

  return NextResponse.json({
    ok: true,
    usersChecked: eligibleUsers.length,
    sent,
    skipped,
    errors,
  });
}

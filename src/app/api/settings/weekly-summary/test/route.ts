import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, people } from "@/db/schema";
import { eq, and, gte, isNotNull } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";
import { getMessagingProvider } from "@/lib/messaging";
import { getUpcomingBirthdays, buildWeeklySummary } from "@/lib/weekly-summary";

/**
 * POST /api/settings/weekly-summary/test
 * Sends a test weekly summary to the authenticated user's Telegram immediately.
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureUser(userId);

  const [user] = await db
    .select({ telegramChatId: users.telegramChatId })
    .from(users)
    .where(eq(users.id, userId));

  if (!user?.telegramChatId) {
    return NextResponse.json(
      { error: "Telegram is not linked. Please link Telegram first." },
      { status: 400 }
    );
  }

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const newContacts = await db
    .select()
    .from(people)
    .where(
      and(eq(people.userId, userId), gte(people.createdAt, oneWeekAgo))
    );

  const upcomingBirthdays = await getUpcomingBirthdays(userId, now, 7);

  const message =
    newContacts.length === 0 && upcomingBirthdays.length === 0
      ? "📋 Weekly People Notes Summary\n\nNo new contacts or upcoming birthdays this week. You're all caught up!\n\n💬 Reply to this message to ask questions about your contacts."
      : buildWeeklySummary(newContacts, upcomingBirthdays);

  const messaging = getMessagingProvider();
  await messaging.sendMessage(user.telegramChatId, message);

  return NextResponse.json({ ok: true });
}

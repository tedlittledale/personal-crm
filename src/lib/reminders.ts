import { db } from "@/db";
import { reminders, users } from "@/db/schema";
import { and, eq, lte, isNotNull } from "drizzle-orm";

export type Reminder = typeof reminders.$inferSelect;

/** Create a follow-up reminder for the user. */
export async function createReminder(
  userId: string,
  input: { personId?: string | null; text: string; dueAt: Date }
): Promise<Reminder> {
  const [reminder] = await db
    .insert(reminders)
    .values({
      userId,
      personId: input.personId ?? null,
      text: input.text.trim(),
      dueAt: input.dueAt,
    })
    .returning();
  return reminder;
}

/**
 * Fetch pending reminders that are due (dueAt ≤ now) for users who have a
 * linked Telegram chat, paired with that chat id for delivery.
 */
export async function getDueReminders(
  now: Date
): Promise<{ reminder: Reminder; telegramChatId: string }[]> {
  const rows = await db
    .select({
      reminder: reminders,
      telegramChatId: users.telegramChatId,
    })
    .from(reminders)
    .innerJoin(users, eq(reminders.userId, users.id))
    .where(
      and(
        eq(reminders.status, "pending"),
        lte(reminders.dueAt, now),
        isNotNull(users.telegramChatId)
      )
    );

  // telegramChatId is guaranteed non-null by the isNotNull filter above.
  return rows.map((r) => ({
    reminder: r.reminder,
    telegramChatId: r.telegramChatId as string,
  }));
}

/** Mark a reminder as sent. */
export async function markReminderSent(id: string, sentAt: Date): Promise<void> {
  await db
    .update(reminders)
    .set({ status: "sent", sentAt })
    .where(eq(reminders.id, id));
}

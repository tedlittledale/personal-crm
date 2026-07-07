import { NextRequest, NextResponse } from "next/server";
import { getMessagingProvider } from "@/lib/messaging";
import { getDueReminders, markReminderSent } from "@/lib/reminders";

/**
 * GET /api/cron/reminders
 * Runs every 30 minutes via Vercel cron. Delivers any pending reminders whose
 * due time has passed to the user's linked Telegram chat, then marks them sent.
 * Protected by CRON_SECRET via Authorization: Bearer header.
 */
export async function GET(req: NextRequest) {
  console.log("[reminders cron] Invoked at", new Date().toISOString());

  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[reminders cron] CRON_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("[reminders cron] Unauthorized - auth header mismatch");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messaging = getMessagingProvider();
  const now = new Date();

  const due = await getDueReminders(now);

  let sent = 0;
  let errors = 0;

  for (const { reminder, telegramChatId } of due) {
    try {
      await messaging.sendMessage(
        telegramChatId,
        `⏰ Reminder\n\n${reminder.text}`
      );
      await markReminderSent(reminder.id, now);
      sent++;
    } catch (err) {
      console.error(`Failed to send reminder ${reminder.id}:`, err);
      errors++;
    }
  }

  console.log(`[reminders cron] Done: due=${due.length} sent=${sent} errors=${errors}`);

  return NextResponse.json({ ok: true, due: due.length, sent, errors });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMessagingProvider } from "@/lib/messaging";
import { answerContactQuestion } from "@/lib/nl-query";

/**
 * POST /api/telegram/webhook
 * Receives Telegram updates via webhook.
 * Handles /start for account linking and general messages for Q&A.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body?.message;

    if (!message?.text || !message?.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id.toString();
    const text = message.text as string;
    const messaging = getMessagingProvider();

    // Handle /start command for account linking
    if (text.startsWith("/start")) {
      const linkToken = text.replace("/start", "").trim();

      if (!linkToken) {
        await messaging.sendMessage(
          chatId,
          "Welcome to People Notes! To link your account, go to Settings in the app and click 'Link Telegram'."
        );
        return NextResponse.json({ ok: true });
      }

      // Look up the user by their link token
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramLinkToken, linkToken));

      if (!user) {
        await messaging.sendMessage(
          chatId,
          "This link has expired or is invalid. Please generate a new one from Settings."
        );
        return NextResponse.json({ ok: true });
      }

      // Save the telegram chat ID and clear the link token
      await db
        .update(users)
        .set({
          telegramChatId: chatId,
          telegramLinkToken: null,
        })
        .where(eq(users.id, user.id));

      await messaging.sendMessage(
        chatId,
        "Your Telegram account is now linked! You'll receive weekly contact summaries here, and you can ask me questions about your contacts anytime."
      );

      return NextResponse.json({ ok: true });
    }

    // Any other text message -- treat as a question about contacts
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramChatId, chatId));

    if (!user) {
      await messaging.sendMessage(
        chatId,
        "Your Telegram isn't linked to a People Notes account yet. Go to Settings in the app and click 'Link Telegram'."
      );
      return NextResponse.json({ ok: true });
    }

    try {
      const answer = await answerContactQuestion(user.id, text);
      await messaging.sendMessage(chatId, answer);
    } catch (err) {
      console.error("Failed to answer contact question:", err);
      await messaging.sendMessage(
        chatId,
        "Sorry, something went wrong while looking up your contacts. Please try again."
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}

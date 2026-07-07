import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMessagingProvider } from "@/lib/messaging";
import { runCrmAgent } from "@/lib/agent/crm-agent";
import {
  getActivePendingAction,
  applyPendingAction,
  clearPendingActionsForChat,
} from "@/lib/agent/pending-actions";

/** Classify a reply to a pending-action confirmation prompt. */
function classifyConfirmation(text: string): "confirm" | "cancel" | "other" {
  const normalized = text.trim().toLowerCase().replace(/[.!,]+$/, "");

  // Multi-word phrases matched in full.
  const confirmPhrases = ["do it", "go ahead", "please do", "yes please", "sounds good"];
  const cancelPhrases = ["never mind", "forget it", "do not", "no thanks", "no thank you"];
  if (confirmPhrases.includes(normalized)) return "confirm";
  if (cancelPhrases.includes(normalized)) return "cancel";

  // Otherwise decide on the first word, so "yes please" / "no thanks" also work
  // without misreading "now update his email" as a cancel.
  const first = normalized.split(/\s+/)[0] ?? "";
  const confirm = new Set([
    "yes", "y", "yeah", "yep", "yup", "ok", "okay", "k", "sure",
    "confirm", "confirmed", "correct",
  ]);
  const cancel = new Set([
    "no", "n", "nope", "cancel", "stop", "don't", "dont", "nevermind",
  ]);
  if (confirm.has(first)) return "confirm";
  if (cancel.has(first)) return "cancel";
  return "other";
}

/**
 * GET /api/telegram/webhook
 * Diagnostic endpoint — returns Telegram's view of the current webhook config.
 * Visit this in a browser to debug webhook issues.
 */
export async function GET() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach Telegram API", details: String(err) },
      { status: 502 }
    );
  }
}

/**
 * POST /api/telegram/webhook
 * Receives Telegram updates via webhook.
 * Handles /start for account linking and general messages for Q&A.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Telegram webhook received:", JSON.stringify(body));
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
      // If a proposed change is awaiting confirmation, a "yes"/"no" answers it.
      const pending = await getActivePendingAction(chatId);
      if (pending) {
        const intent = classifyConfirmation(text);
        if (intent === "confirm") {
          const result = await applyPendingAction(
            user.id,
            pending.payload,
            user.weeklySummaryTimezone
          );
          await clearPendingActionsForChat(chatId);
          await messaging.sendMessage(chatId, result);
          return NextResponse.json({ ok: true });
        }
        if (intent === "cancel") {
          await clearPendingActionsForChat(chatId);
          await messaging.sendMessage(
            chatId,
            "Okay, cancelled. Nothing was changed."
          );
          return NextResponse.json({ ok: true });
        }
        // Anything else is a new request: abandon the stale proposal so a later
        // stray "yes" can't apply it. The agent may stage a fresh one below.
        await clearPendingActionsForChat(chatId);
      }

      const reply = await runCrmAgent(
        { userId: user.id, chatId, timezone: user.weeklySummaryTimezone },
        text
      );
      await messaging.sendMessage(chatId, reply);
    } catch (err) {
      console.error("Failed to handle Telegram message:", err);
      await messaging.sendMessage(
        chatId,
        "Sorry, something went wrong. Please try again."
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}

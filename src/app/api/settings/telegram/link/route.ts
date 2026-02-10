import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";
import crypto from "crypto";

/**
 * Ensure the Telegram webhook is pointed at our API route.
 * This is idempotent — Telegram ignores the call if the URL is already set.
 */
async function ensureWebhookRegistered(requestUrl: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  // Derive the app's origin from the incoming request
  const url = new URL(requestUrl);
  const webhookUrl = `${url.origin}/api/telegram/webhook`;

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error("Failed to register Telegram webhook:", body);
  }
}

/**
 * POST /api/settings/telegram/link
 * Generates a link token and returns the Telegram deep link URL.
 * Also ensures the Telegram webhook is registered.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUser(userId);

  // Generate a random link token
  const linkToken = crypto.randomBytes(16).toString("base64url");

  // Store it on the user record
  await db
    .update(users)
    .set({ telegramLinkToken: linkToken })
    .where(eq(users.id, userId));

  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!botUsername) {
    return NextResponse.json(
      { error: "Telegram bot not configured" },
      { status: 500 }
    );
  }

  // Ensure webhook is registered (fire-and-forget, don't block the response)
  ensureWebhookRegistered(req.url).catch((err) =>
    console.error("Webhook registration error:", err)
  );

  const deepLink = `https://t.me/${botUsername}?start=${linkToken}`;

  return NextResponse.json({ deepLink, linkToken });
}

/**
 * DELETE /api/settings/telegram/link
 * Unlinks the user's Telegram account.
 */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .update(users)
    .set({ telegramChatId: null, telegramLinkToken: null })
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}

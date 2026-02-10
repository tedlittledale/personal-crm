import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";
import crypto from "crypto";

/**
 * Ensure the Telegram webhook is pointed at our API route.
 * Returns an error string if registration fails, or null on success.
 */
async function ensureWebhookRegistered(req: NextRequest): Promise<string | null> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return "TELEGRAM_BOT_TOKEN is not set";

  // Derive the public origin from forwarded headers (works behind proxies/Vercel)
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host) return "Could not determine app host from request headers";

  const webhookUrl = `${proto}://${host}/api/telegram/webhook`;

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    }
  );

  const body = await res.json();
  if (!res.ok || !body.ok) {
    const errMsg = `Webhook registration failed: ${JSON.stringify(body)}`;
    console.error(errMsg);
    return errMsg;
  }

  console.log(`Telegram webhook registered: ${webhookUrl}`);
  return null;
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

  // Register webhook (blocking — we need this to work for linking to succeed)
  const webhookError = await ensureWebhookRegistered(req);
  if (webhookError) {
    console.error("Webhook registration issue:", webhookError);
  }

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

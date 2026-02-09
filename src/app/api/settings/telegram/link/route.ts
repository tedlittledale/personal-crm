import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";
import crypto from "crypto";

/**
 * POST /api/settings/telegram/link
 * Generates a link token and returns the Telegram deep link URL.
 */
export async function POST() {
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

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    return NextResponse.json(
      { error: "Telegram bot not configured" },
      { status: 500 }
    );
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

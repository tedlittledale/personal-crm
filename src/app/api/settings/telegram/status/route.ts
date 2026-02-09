import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";

/**
 * GET /api/settings/telegram/status
 * Returns whether the user's Telegram account is linked.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUser(userId);

  const [user] = await db
    .select({
      telegramChatId: users.telegramChatId,
    })
    .from(users)
    .where(eq(users.id, userId));

  return NextResponse.json({
    linked: !!user?.telegramChatId,
  });
}

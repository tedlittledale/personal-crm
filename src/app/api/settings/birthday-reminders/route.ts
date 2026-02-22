import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";

/**
 * GET /api/settings/birthday-reminders
 * Returns whether birthday reminders are enabled for the user.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureUser(userId);

  const [user] = await db
    .select({ enabled: users.birthdayRemindersEnabled })
    .from(users)
    .where(eq(users.id, userId));

  return NextResponse.json({ enabled: user.enabled });
}

/**
 * PUT /api/settings/birthday-reminders
 * Toggles birthday reminders on or off.
 */
export async function PUT(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureUser(userId);

  const body = await req.json();
  const { enabled } = body;

  if (typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled must be a boolean" },
      { status: 400 }
    );
  }

  await db
    .update(users)
    .set({ birthdayRemindersEnabled: enabled })
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true, enabled });
}

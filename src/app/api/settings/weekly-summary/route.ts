import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";

/**
 * GET /api/settings/weekly-summary
 * Returns the user's weekly summary settings.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureUser(userId);

  const [user] = await db
    .select({
      hour: users.weeklySummaryHour,
      timezone: users.weeklySummaryTimezone,
      lastSentAt: users.lastWeeklySummaryAt,
    })
    .from(users)
    .where(eq(users.id, userId));

  return NextResponse.json({
    hour: user.hour,
    timezone: user.timezone,
    lastSentAt: user.lastSentAt,
  });
}

/**
 * PUT /api/settings/weekly-summary
 * Updates the user's weekly summary settings.
 */
export async function PUT(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureUser(userId);

  const body = await req.json();
  const { hour, timezone } = body;

  // Validate hour
  if (typeof hour !== "number" || hour < 0 || hour > 23 || !Number.isInteger(hour)) {
    return NextResponse.json(
      { error: "Hour must be an integer between 0 and 23" },
      { status: 400 }
    );
  }

  // Validate timezone by trying to use it
  if (typeof timezone !== "string") {
    return NextResponse.json(
      { error: "Timezone must be a string" },
      { status: 400 }
    );
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return NextResponse.json(
      { error: "Invalid IANA timezone" },
      { status: 400 }
    );
  }

  await db
    .update(users)
    .set({ weeklySummaryHour: hour, weeklySummaryTimezone: timezone })
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true, hour, timezone });
}

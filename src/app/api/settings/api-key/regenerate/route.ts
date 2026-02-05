import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

function generateApiKey(): string {
  return `pn_${randomBytes(24).toString("base64url")}`;
}

// POST /api/settings/api-key/regenerate - Generate a new API key
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const newApiKey = generateApiKey();

  const [updated] = await db
    .update(users)
    .set({ apiKey: newApiKey })
    .where(eq(users.id, userId))
    .returning({ apiKey: users.apiKey });

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ apiKey: updated.apiKey });
}

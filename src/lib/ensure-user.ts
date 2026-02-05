import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

function generateApiKey(): string {
  return `pn_${randomBytes(24).toString("base64url")}`;
}

/**
 * Ensure a user record exists in our database for the given Clerk user ID.
 * Creates one with a fresh API key if it doesn't exist yet.
 * This is a safety net in case the Clerk webhook didn't fire
 * (e.g. user signed up before webhook was configured).
 */
export async function ensureUser(userId: string) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId));

  if (existing) return;

  await db
    .insert(users)
    .values({
      id: userId,
      apiKey: generateApiKey(),
    })
    .onConflictDoNothing();
}

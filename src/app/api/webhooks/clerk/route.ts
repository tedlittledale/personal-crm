import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { randomBytes } from "crypto";

function generateApiKey(): string {
  return `pn_${randomBytes(24).toString("base64url")}`;
}

export async function POST(req: NextRequest) {
  try {
    const evt = await verifyWebhook(req);

    if (evt.type === "user.created") {
      const { id } = evt.data;

      await db.insert(users).values({
        id,
        apiKey: generateApiKey(),
      });

      console.log(`Created user record for Clerk user ${id}`);
    }

    return new Response("Webhook received", { status: 200 });
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error verifying webhook", { status: 400 });
  }
}

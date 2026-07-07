import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runCrmAgent } from "@/lib/agent/crm-agent";
import {
  getActivePendingAction,
  applyPendingAction,
  clearPendingActionsForChat,
} from "@/lib/agent/pending-actions";

/**
 * Manual driver for the Telegram CRM agent. Exercises the same code path the
 * webhook uses, without needing Telegram. Requires DATABASE_URL and
 * ANTHROPIC_API_KEY in .env.local, and at least one user in the database.
 *
 * Usage:
 *   npx tsx scripts/test-agent.ts "who works at Acme?"
 *   npx tsx scripts/test-agent.ts "update Sarah's phone to 555-1234"
 *   npx tsx scripts/test-agent.ts --confirm      # applies the staged change
 *
 * Set TEST_USER_ID to target a specific user; otherwise the first user is used.
 */

const CHAT_ID = "test-agent-cli";

async function main() {
  const arg = process.argv.slice(2).join(" ").trim();
  if (!arg) {
    console.error('Provide a message, e.g. npx tsx scripts/test-agent.ts "hi"');
    process.exit(1);
  }

  const [user] = process.env.TEST_USER_ID
    ? await db.select().from(users).where(eq(users.id, process.env.TEST_USER_ID))
    : await db.select().from(users).limit(1);

  if (!user) {
    console.error("No user found. Create a user first.");
    process.exit(1);
  }

  const timezone = user.weeklySummaryTimezone;

  if (arg === "--confirm") {
    const pending = await getActivePendingAction(CHAT_ID);
    if (!pending) {
      console.log("No pending action to confirm.");
      process.exit(0);
    }
    console.log("Applying:", pending.summary);
    const result = await applyPendingAction(user.id, pending.payload, timezone);
    await clearPendingActionsForChat(CHAT_ID);
    console.log("Result:", result);
    process.exit(0);
  }

  console.log(`User: ${user.id}  tz: ${timezone}`);
  console.log(`> ${arg}`);
  const reply = await runCrmAgent(
    { userId: user.id, chatId: CHAT_ID, timezone },
    arg
  );
  console.log(`bot: ${reply}`);

  const pending = await getActivePendingAction(CHAT_ID);
  if (pending) {
    console.log(`\n[staged action] ${pending.summary}`);
    console.log('Run: npx tsx scripts/test-agent.ts --confirm');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

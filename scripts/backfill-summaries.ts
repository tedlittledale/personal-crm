import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { people } from "../src/db/schema";
import { isNull } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { generateContactSummary } from "../src/lib/generate-summary";

const BATCH_SIZE = 5;

async function main() {
  const contacts = await db
    .select()
    .from(people)
    .where(isNull(people.aiSummary));

  console.log(`Found ${contacts.length} contacts without AI summaries.`);

  if (contacts.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (contact) => {
        try {
          const summary = await generateContactSummary(contact);
          await db
            .update(people)
            .set({ aiSummary: summary })
            .where(eq(people.id, contact.id));
          processed++;
          console.log(`[${processed}/${contacts.length}] ${contact.name}: ${summary}`);
        } catch (err) {
          failed++;
          console.error(`Failed for ${contact.name}:`, err);
        }
      })
    );
  }

  console.log(
    `\nDone. Processed: ${processed}, Failed: ${failed}, Total: ${contacts.length}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});

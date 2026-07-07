import { db } from "@/db";
import { people } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";
import {
  generateContactSummary,
  generateChangeDescription,
} from "@/lib/generate-summary";

export type Contact = typeof people.$inferSelect;

/** The editable fields of a contact. `name` is required on create. */
export type ContactInput = {
  name: string;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  personalDetails?: string | null;
  notes?: string | null;
  source?: string | null;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
  children?: string | null;
};

/** Normalize a full contact input into DB values (trim strings, empty → null). */
function toContactValues(userId: string, input: ContactInput) {
  return {
    userId,
    name: input.name.trim(),
    company: input.company?.trim() || null,
    role: input.role?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    personalDetails: input.personalDetails?.trim() || null,
    notes: input.notes?.trim() || null,
    source: input.source?.trim() || null,
    birthdayMonth: input.birthdayMonth ?? null,
    birthdayDay: input.birthdayDay ?? null,
    children: input.children?.trim() || null,
  };
}

/** Build the partial `set` object for an update — only touch provided fields. */
function toUpdateValues(patch: Partial<ContactInput>) {
  return {
    ...(patch.name !== undefined && { name: patch.name.trim() }),
    ...(patch.company !== undefined && { company: patch.company?.trim() || null }),
    ...(patch.role !== undefined && { role: patch.role?.trim() || null }),
    ...(patch.email !== undefined && { email: patch.email?.trim() || null }),
    ...(patch.phone !== undefined && { phone: patch.phone?.trim() || null }),
    ...(patch.address !== undefined && { address: patch.address?.trim() || null }),
    ...(patch.personalDetails !== undefined && {
      personalDetails: patch.personalDetails?.trim() || null,
    }),
    ...(patch.notes !== undefined && { notes: patch.notes?.trim() || null }),
    ...(patch.source !== undefined && { source: patch.source?.trim() || null }),
    ...(patch.birthdayMonth !== undefined && {
      birthdayMonth: patch.birthdayMonth ?? null,
    }),
    ...(patch.birthdayDay !== undefined && {
      birthdayDay: patch.birthdayDay ?? null,
    }),
    ...(patch.children !== undefined && { children: patch.children?.trim() || null }),
    updatedAt: new Date(),
  };
}

/** Fetch a single contact owned by the user, or null. */
export async function getContactById(
  userId: string,
  id: string
): Promise<Contact | null> {
  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, userId)));
  return person ?? null;
}

/**
 * Create a contact for the user. Ensures the user row exists, inserts the
 * contact, and generates the AI summary in the background (fire-and-forget,
 * matching the app's create behavior).
 */
export async function createContact(
  userId: string,
  input: ContactInput
): Promise<Contact> {
  if (!input.name || input.name.trim().length === 0) {
    throw new Error("Name is required");
  }

  await ensureUser(userId);

  const values = toContactValues(userId, input);
  const [person] = await db.insert(people).values(values).returning();

  // Generate AI summary in the background — don't block the caller.
  generateContactSummary(person)
    .then((aiSummary) =>
      db.update(people).set({ aiSummary }).where(eq(people.id, person.id))
    )
    .catch((err) => console.error("Failed to generate summary:", err));

  return person;
}

/**
 * Create multiple contacts in a single insert. Generates AI summaries in the
 * background for each. Callers should validate that every input has a name.
 */
export async function createContactsBulk(
  userId: string,
  inputs: ContactInput[]
): Promise<Contact[]> {
  await ensureUser(userId);

  const values = inputs.map((input) => toContactValues(userId, input));
  const created = await db.insert(people).values(values).returning();

  Promise.all(
    created.map((person) =>
      generateContactSummary(person)
        .then((aiSummary) =>
          db.update(people).set({ aiSummary }).where(eq(people.id, person.id))
        )
        .catch((err) =>
          console.error(`Failed to generate summary for ${person.name}:`, err)
        )
    )
  ).catch((err) => console.error("Failed to generate bulk summaries:", err));

  return created;
}

/**
 * Update a contact owned by the user. Returns null if it doesn't exist.
 * Regenerates the AI summary and change description. By default these run in
 * the background (matching the app's edit behavior); pass
 * `awaitSummaries: true` to await them and get the change description back
 * (used by the Telegram agent so it can report what changed).
 */
export async function updateContact(
  userId: string,
  id: string,
  patch: Partial<ContactInput>,
  opts: { awaitSummaries?: boolean } = {}
): Promise<{ updated: Contact; changeDescription: string } | null> {
  const existing = await getContactById(userId, id);
  if (!existing) return null;

  const [updated] = await db
    .update(people)
    .set(toUpdateValues(patch))
    .where(eq(people.id, id))
    .returning();

  const summaries = Promise.all([
    generateContactSummary(updated),
    generateChangeDescription(existing, updated),
  ]).then(async ([aiSummary, changeDescription]) => {
    await db
      .update(people)
      .set({
        aiSummary,
        ...(changeDescription && { lastChangeDescription: changeDescription }),
      })
      .where(eq(people.id, id));
    return changeDescription;
  });

  if (opts.awaitSummaries) {
    const changeDescription = await summaries;
    return { updated, changeDescription };
  }

  summaries.catch((err) => console.error("Failed to generate summaries:", err));
  return { updated, changeDescription: "" };
}

/** Delete a contact owned by the user. Returns true if a row was deleted. */
export async function deleteContact(
  userId: string,
  id: string
): Promise<boolean> {
  const [deleted] = await db
    .delete(people)
    .where(and(eq(people.id, id), eq(people.userId, userId)))
    .returning({ id: people.id });
  return !!deleted;
}

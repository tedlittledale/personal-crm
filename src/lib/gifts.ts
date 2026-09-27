import { db } from "@/db";
import { giftIdeas, people, users } from "@/db/schema";
import { and, asc, eq, gt, inArray, ne, type SQL } from "drizzle-orm";
import {
  localDate,
  resolveOccasion,
  type GiftStatus,
  type Occasion,
  type OccasionType,
} from "@/lib/gift-occasions";

export type GiftIdea = typeof giftIdeas.$inferSelect;

/** A gift idea together with the contact it is for. */
export type GiftIdeaWithPerson = GiftIdea & {
  personName: string;
  birthdayMonth: number | null;
  birthdayDay: number | null;
};

export type RequestedOccasion = {
  type?: OccasionType | null;
  year?: number | null;
  label?: string | null;
};

export type GiftPatch = {
  idea?: string;
  notes?: string | null;
  status?: GiftStatus;
  occasionType?: OccasionType;
  occasionYear?: number;
  occasionLabel?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ids come from the agent and URLs, and Postgres throws on a malformed uuid,
 * so treat one as "not found" instead.
 */
function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/** The user's timezone (shared with the weekly summary setting). */
export async function getUserTimezone(userId: string): Promise<string> {
  const [user] = await db
    .select({ timezone: users.weeklySummaryTimezone })
    .from(users)
    .where(eq(users.id, userId));
  return user?.timezone ?? "Europe/London";
}

/**
 * List the user's gift ideas, oldest first, optionally narrowed to one
 * contact or occasion. Dropped ideas are left out unless asked for.
 */
export async function listGiftIdeas(
  userId: string,
  filters: {
    personId?: string;
    occasionType?: OccasionType;
    year?: number;
    includeDropped?: boolean;
  } = {}
): Promise<GiftIdeaWithPerson[]> {
  if (filters.personId && !isUuid(filters.personId)) return [];
  const conditions: SQL[] = [eq(giftIdeas.userId, userId)];
  if (filters.personId) conditions.push(eq(giftIdeas.personId, filters.personId));
  if (filters.occasionType) conditions.push(eq(giftIdeas.occasionType, filters.occasionType));
  if (filters.year) conditions.push(eq(giftIdeas.occasionYear, filters.year));
  if (!filters.includeDropped) conditions.push(ne(giftIdeas.status, "dropped"));

  const rows = await db
    .select({
      gift: giftIdeas,
      personName: people.name,
      birthdayMonth: people.birthdayMonth,
      birthdayDay: people.birthdayDay,
    })
    .from(giftIdeas)
    .innerJoin(people, eq(giftIdeas.personId, people.id))
    .where(and(...conditions))
    .orderBy(asc(giftIdeas.createdAt));

  return rows.map((r) => ({
    ...r.gift,
    personName: r.personName,
    birthdayMonth: r.birthdayMonth,
    birthdayDay: r.birthdayDay,
  }));
}

/** A single gift idea, scoped to the user. */
export async function getGiftIdea(
  userId: string,
  id: string
): Promise<GiftIdea | null> {
  if (!isUuid(id)) return null;
  const [gift] = await db
    .select()
    .from(giftIdeas)
    .where(and(eq(giftIdeas.id, id), eq(giftIdeas.userId, userId)));
  return gift ?? null;
}

/**
 * Save one or more gift ideas for a contact. With no occasion given they are
 * filed under the contact's next birthday or Christmas. Returns null if the
 * contact does not belong to the user.
 */
export async function addGiftIdeas(
  userId: string,
  personId: string,
  ideas: { idea: string; notes?: string | null }[],
  requested: RequestedOccasion,
  timezone: string
): Promise<{ personName: string; occasion: Occasion; gifts: GiftIdea[] } | null> {
  if (!isUuid(personId)) return null;
  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, userId)));
  if (!person) return null;

  const occasion = resolveOccasion(requested, person, localDate(new Date(), timezone));
  const values = ideas
    .map((i) => ({ idea: i.idea.trim(), notes: i.notes?.trim() || null }))
    .filter((i) => i.idea.length > 0)
    .map((i) => ({
      userId,
      personId,
      ...i,
      occasionType: occasion.type,
      occasionYear: occasion.year,
      occasionLabel: occasion.label ?? null,
    }));

  const gifts = values.length
    ? await db.insert(giftIdeas).values(values).returning()
    : [];
  return { personName: person.name, occasion, gifts };
}

/** Update a gift idea. Returns null if it does not belong to the user. */
export async function updateGiftIdea(
  userId: string,
  id: string,
  patch: GiftPatch
): Promise<GiftIdea | null> {
  if (!isUuid(id)) return null;
  const now = new Date();
  const [gift] = await db
    .update(giftIdeas)
    .set({
      ...(patch.idea !== undefined && { idea: patch.idea.trim() }),
      ...(patch.notes !== undefined && { notes: patch.notes?.trim() || null }),
      ...(patch.status !== undefined && { status: patch.status, statusChangedAt: now }),
      ...(patch.occasionType !== undefined && { occasionType: patch.occasionType }),
      ...(patch.occasionYear !== undefined && { occasionYear: patch.occasionYear }),
      ...(patch.occasionLabel !== undefined && {
        occasionLabel: patch.occasionLabel?.trim() || null,
      }),
      updatedAt: now,
    })
    .where(and(eq(giftIdeas.id, id), eq(giftIdeas.userId, userId)))
    .returning();
  return gift ?? null;
}

/**
 * Delete gift ideas by id. With `createdAfter`, only ideas created since then
 * are removed (used for "undo" straight after an add). Returns the number
 * deleted.
 */
export async function deleteGiftIdeas(
  userId: string,
  ids: string[],
  options: { createdAfter?: Date } = {}
): Promise<number> {
  ids = ids.filter(isUuid);
  if (ids.length === 0) return 0;
  const conditions: SQL[] = [
    eq(giftIdeas.userId, userId),
    inArray(giftIdeas.id, ids),
  ];
  if (options.createdAfter) {
    conditions.push(gt(giftIdeas.createdAt, options.createdAfter));
  }
  const deleted = await db
    .delete(giftIdeas)
    .where(and(...conditions))
    .returning({ id: giftIdeas.id });
  return deleted.length;
}

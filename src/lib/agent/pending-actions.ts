import { db } from "@/db";
import { pendingActions } from "@/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import {
  createContact,
  updateContact,
  type ContactInput,
} from "@/lib/contacts";
import { createReminder } from "@/lib/reminders";

const PENDING_ACTION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * A write the agent has proposed but not yet applied. Persisted between
 * webhook requests so the next affirmative message can execute it.
 */
export type PendingActionPayload =
  | { type: "createContact"; input: ContactInput }
  | {
      type: "updateContact";
      contactId: string;
      contactName: string;
      patch: Partial<ContactInput>;
    }
  | {
      type: "createReminder";
      personId: string | null;
      personName: string | null;
      text: string;
      dueAtISO: string;
    };

/**
 * Stage a proposed write for a chat, replacing any prior pending action so at
 * most one is active at a time. Returns nothing — the caller (agent tool)
 * reports the summary to the user and asks them to confirm.
 */
export async function proposePendingAction(
  userId: string,
  chatId: string,
  action: PendingActionPayload,
  summary: string
): Promise<void> {
  await clearPendingActionsForChat(chatId);

  await db.insert(pendingActions).values({
    userId,
    chatId,
    actionType: action.type,
    payload: action,
    summary,
    expiresAt: new Date(Date.now() + PENDING_ACTION_TTL_MS),
  });
}

/** The most recent non-expired pending action for a chat, or null. */
export async function getActivePendingAction(
  chatId: string
): Promise<{ id: string; summary: string; payload: PendingActionPayload } | null> {
  const [row] = await db
    .select()
    .from(pendingActions)
    .where(
      and(
        eq(pendingActions.chatId, chatId),
        gt(pendingActions.expiresAt, new Date())
      )
    )
    .orderBy(desc(pendingActions.createdAt))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    summary: row.summary,
    payload: row.payload as PendingActionPayload,
  };
}

/** Remove all pending actions for a chat (after apply, cancel, or expiry). */
export async function clearPendingActionsForChat(chatId: string): Promise<void> {
  await db.delete(pendingActions).where(eq(pendingActions.chatId, chatId));
}

/**
 * Apply a confirmed pending action and return a user-facing result message.
 * Every operation is re-scoped to `userId` for safety, regardless of what the
 * stored payload claims. `timezone` is used to render reminder times.
 */
export async function applyPendingAction(
  userId: string,
  payload: PendingActionPayload,
  timezone: string
): Promise<string> {
  switch (payload.type) {
    case "createContact": {
      const person = await createContact(userId, payload.input);
      return `✅ Added ${person.name} to your contacts.`;
    }
    case "updateContact": {
      const result = await updateContact(userId, payload.contactId, payload.patch, {
        awaitSummaries: true,
      });
      if (!result) {
        return "That contact no longer exists, so nothing was changed.";
      }
      const change = result.changeDescription
        ? ` ${result.changeDescription}`
        : "";
      return `✅ Updated ${result.updated.name}.${change}`;
    }
    case "createReminder": {
      const dueAt = new Date(payload.dueAtISO);
      await createReminder(userId, {
        personId: payload.personId,
        text: payload.text,
        dueAt,
      });
      return `✅ Reminder set for ${formatDueAt(dueAt, timezone)}.`;
    }
  }
}

/** Format a reminder time in the user's timezone, e.g. "Tue, 8 Jul at 09:00". */
export function formatDueAt(dueAt: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dueAt);
}

import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { and, desc, eq, gt, lt, notInArray } from "drizzle-orm";
import type { ModelMessage } from "ai";

/**
 * How much recent conversation the agent sees on each message. The Telegram
 * webhook is stateless, so without this every message is read in isolation
 * and a reply like "1" to a clarifying question looks like a new command.
 */
const MAX_HISTORY_MESSAGES = 40;
const HISTORY_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Rows older than this are deleted on each write, so the table stays small. */
const RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Load the recent conversation for a chat as AI SDK messages, oldest first.
 *
 * The result always starts with a user message: the count cap can otherwise
 * cut between an assistant tool call and its tool result, which the model API
 * rejects.
 */
export async function loadConversationHistory(
  chatId: string
): Promise<ModelMessage[]> {
  const rows = await db
    .select({ message: chatMessages.message })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.chatId, chatId),
        gt(chatMessages.createdAt, new Date(Date.now() - HISTORY_MAX_AGE_MS))
      )
    )
    .orderBy(desc(chatMessages.seq))
    .limit(MAX_HISTORY_MESSAGES);

  const messages = rows.reverse().map((r) => r.message as ModelMessage);
  const firstUser = messages.findIndex((m) => m.role === "user");
  return firstUser === -1 ? [] : messages.slice(firstUser);
}

/**
 * Append messages from one turn to the chat's history and prune old rows.
 * Inserted in one statement so `seq` preserves their order.
 */
export async function appendConversationMessages(
  userId: string,
  chatId: string,
  messages: ModelMessage[]
): Promise<void> {
  if (messages.length === 0) return;

  await db.insert(chatMessages).values(
    messages.map((message) => ({
      userId,
      chatId,
      role: message.role,
      message,
    }))
  );

  await pruneConversation(chatId);
}

/** Record a plain text exchange (e.g. a confirmation handled outside the agent). */
export async function appendConversationExchange(
  userId: string,
  chatId: string,
  userText: string,
  assistantText: string
): Promise<void> {
  await appendConversationMessages(userId, chatId, [
    { role: "user", content: userText },
    { role: "assistant", content: assistantText },
  ]);
}

/** Forget the conversation so the next message starts fresh. */
export async function clearConversation(chatId: string): Promise<void> {
  await db.delete(chatMessages).where(eq(chatMessages.chatId, chatId));
}

/** Delete rows past the retention window or beyond the count cap. */
async function pruneConversation(chatId: string): Promise<void> {
  await db
    .delete(chatMessages)
    .where(
      and(
        eq(chatMessages.chatId, chatId),
        lt(chatMessages.createdAt, new Date(Date.now() - RETENTION_MS))
      )
    );

  const keep = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(desc(chatMessages.seq))
    .limit(MAX_HISTORY_MESSAGES);

  if (keep.length < MAX_HISTORY_MESSAGES) return;

  await db
    .delete(chatMessages)
    .where(
      and(
        eq(chatMessages.chatId, chatId),
        notInArray(
          chatMessages.id,
          keep.map((r) => r.id)
        )
      )
    );
}

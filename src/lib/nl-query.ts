import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { people } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your .env.local file."
    );
  }
  return new Anthropic({ apiKey });
}

const MONTH_NAMES = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatContactLine(
  p: typeof people.$inferSelect,
  index: number
): string {
  const parts = [`#${index}:${p.id}`, p.name];
  if (p.company) parts.push(`@${p.company}`);
  if (p.role) parts.push(`(${p.role})`);
  if (p.email) parts.push(p.email);
  if (p.phone) parts.push(p.phone);
  if (p.personalDetails) parts.push(p.personalDetails);
  if (p.notes) parts.push(`Notes: ${p.notes}`);
  if (p.source) parts.push(`Via: ${p.source}`);
  if (p.birthdayMonth && p.birthdayDay)
    parts.push(`Bday: ${MONTH_NAMES[p.birthdayMonth]} ${p.birthdayDay}`);
  if (p.children) parts.push(`Kids: ${p.children}`);
  return parts.join(" | ");
}

const SEARCH_SYSTEM_PROMPT = `You are a personal CRM assistant. The user's full contact list is provided in <contacts> tags.
Each contact is on its own line, formatted as: #index:uuid | Name | @Company | (Role) | other details...

Answer the user's question by examining ALL contacts. You can cross-reference contacts, search free-text fields semantically, and reason about relationships between people.

Respond in this JSON format:
{
  "answer": "<concise, conversational answer to the question>",
  "contactIds": ["<uuid1>", "<uuid2>"]
}

Rules:
- "contactIds" must list the UUIDs of all contacts relevant to your answer
- Keep answers brief and conversational
- If no contacts match, return empty contactIds and explain in the answer
- Return ONLY valid JSON, no markdown fencing`;

/**
 * Query contacts by sending the full contact list to Claude and letting it
 * answer the question directly. Uses Haiku for cost efficiency.
 */
async function queryContactsFromFullContext(
  userId: string,
  question: string
): Promise<{ answer: string; contactIds: string[] }> {
  const allContacts = await db
    .select()
    .from(people)
    .where(eq(people.userId, userId))
    .orderBy(people.name);

  if (allContacts.length === 0) {
    return {
      answer: "You don't have any contacts yet.",
      contactIds: [],
    };
  }

  const contactLines = allContacts
    .map((p, i) => formatContactLine(p, i + 1))
    .join("\n");

  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SEARCH_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<contacts>\n${contactLines}\n</contacts>\n\nQuestion: ${question}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "{}";

  const cleaned = text
    .replace(/```json?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      answer: parsed.answer || "Sorry, I couldn't generate an answer.",
      contactIds: Array.isArray(parsed.contactIds) ? parsed.contactIds : [],
    };
  } catch {
    // If JSON parsing fails, treat the whole response as the answer
    return { answer: cleaned, contactIds: [] };
  }
}

/**
 * Execute a natural language query against the people table.
 * Returns the matching contacts and a summary string.
 */
export async function executeNaturalLanguageQuery(
  userId: string,
  query: string
): Promise<{
  results: (typeof people.$inferSelect)[];
  summary: string;
}> {
  const { answer, contactIds } = await queryContactsFromFullContext(
    userId,
    query
  );

  let results: (typeof people.$inferSelect)[] = [];

  if (contactIds.length > 0) {
    results = await db
      .select()
      .from(people)
      .where(inArray(people.id, contactIds))
      .orderBy(desc(people.updatedAt));
  }

  return { results, summary: answer };
}

/**
 * Answer a natural language question about contacts.
 * Used by the Telegram bot Q&A flow.
 */
export async function answerContactQuestion(
  userId: string,
  question: string
): Promise<string> {
  const { answer } = await queryContactsFromFullContext(userId, question);
  return answer;
}

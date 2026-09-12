import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { people } from "@/db/schema";
import { eq } from "drizzle-orm";

type Person = typeof people.$inferSelect;

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

function formatContactLine(p: Person, index: number): string {
  const parts = [`#${index}:${p.id}`, p.name];
  if (p.company) parts.push(`@${p.company}`);
  if (p.role) parts.push(`(${p.role})`);
  if (p.email) parts.push(p.email);
  if (p.phone) parts.push(p.phone);
  if (p.address) parts.push(`Address: ${p.address}`);
  if (p.personalDetails) parts.push(p.personalDetails);
  if (p.notes) parts.push(`Notes: ${p.notes}`);
  if (p.source) parts.push(`Via: ${p.source}`);
  if (p.birthdayMonth && p.birthdayDay)
    parts.push(`Bday: ${MONTH_NAMES[p.birthdayMonth]} ${p.birthdayDay}`);
  if (p.children) parts.push(`Kids: ${p.children}`);
  return parts.join(" | ");
}

/** Lower-case, strip accents, collapse whitespace — for text matching. */
function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** All the free-text fields of a contact, joined for keyword matching. */
function contactHaystack(p: Person): string {
  return normalizeText(
    [
      p.name,
      p.company,
      p.role,
      p.email,
      p.phone,
      p.address,
      p.personalDetails,
      p.notes,
      p.source,
      p.children,
    ]
      .filter((v): v is string => !!v)
      .join(" \n ")
  );
}

/**
 * Deterministic text search: contacts where every word of the query appears
 * somewhere in their fields (case- and accent-insensitive). A bare name or
 * keyword like "Juan" or "Spanish" always hits here, whatever the model does
 * with it, so these are guaranteed to be in the results.
 */
export function findKeywordMatches(contacts: Person[], query: string): Person[] {
  const words = normalizeText(query).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  return contacts.filter((p) => {
    const hay = contactHaystack(p);
    return words.every((w) => hay.includes(w));
  });
}

/** Plain-language summary used when the model gives us nothing usable. */
function describeMatches(query: string, matches: Person[]): string {
  const names = matches.slice(0, 10).map((p) => {
    const extra = [p.company, p.role].filter(Boolean).join(", ");
    return extra ? `${p.name} (${extra})` : p.name;
  });
  const more = matches.length > names.length ? ` and ${matches.length - names.length} more` : "";
  const noun = matches.length === 1 ? "contact" : "contacts";
  return `Found ${matches.length} ${noun} matching "${query}": ${names.join("; ")}${more}.`;
}

const SEARCH_SYSTEM_PROMPT = `You are a personal CRM assistant. The user's full contact list is provided in <contacts> tags.
Each contact is on its own line, formatted as: #index:uuid | Name | @Company | (Role) | other details...

Answer the user's query by examining ALL contacts. You can cross-reference contacts, search free-text fields semantically, and reason about relationships between people.

The query is often not a question but just a name, word, or short phrase (e.g. "Juan", "Spanish", "bunny tales"). Treat that as "find everyone this relates to": return every contact whose name or details match it, and summarise what you know about them.

If a <keyword_matches> section is present, it lists contacts whose fields literally contain the query text. They are almost certainly relevant: include them unless the query clearly means something else.

Respond in this JSON format:
{
  "answer": "<concise, conversational answer to the query>",
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
 *
 * Exact text hits (see findKeywordMatches) are pointed out to the model and
 * merged into the result regardless of what it returns, and they are used as
 * the answer on their own if the model call fails. A search for a name that
 * is plainly in the list must never come back empty.
 */
async function queryContactsFromFullContext(
  userId: string,
  question: string
): Promise<{ answer: string; contacts: Person[] }> {
  const allContacts = await db
    .select()
    .from(people)
    .where(eq(people.userId, userId))
    .orderBy(people.name);

  if (allContacts.length === 0) {
    return {
      answer: "You don't have any contacts yet.",
      contacts: [],
    };
  }

  const keywordMatches = findKeywordMatches(allContacts, question);
  const indexOf = new Map(allContacts.map((c, i) => [c.id, i + 1]));

  const contactLines = allContacts
    .map((p, i) => formatContactLine(p, i + 1))
    .join("\n");

  const keywordSection =
    keywordMatches.length > 0
      ? `\n\n<keyword_matches>\nThese contacts contain the query text in one of their fields: ${keywordMatches
          .slice(0, 50)
          .map((p) => `#${indexOf.get(p.id)}`)
          .join(", ")}\n</keyword_matches>`
      : "";

  /** Merge the model's picks with the keyword hits, keeping the order stable. */
  const withKeywordMatches = (picked: Person[]): Person[] => {
    const merged = [...picked];
    for (const p of keywordMatches) if (!merged.includes(p)) merged.push(p);
    return merged;
  };

  let text: string;
  try {
    const anthropic = getClient();
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SEARCH_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `<contacts>\n${contactLines}\n</contacts>${keywordSection}\n\nQuery: ${question}`,
        },
      ],
    });
    text =
      message.content[0]?.type === "text" ? message.content[0].text : "{}";
  } catch (err) {
    // The model call is the fragile part (API errors, a contact list that
    // has outgrown the context window). Fall back to the exact-text hits
    // rather than failing the whole search when we have something to show.
    console.error(
      `Contact search model call failed (query: ${JSON.stringify(question)}, contacts: ${allContacts.length}, keyword matches: ${keywordMatches.length}):`,
      err
    );
    if (keywordMatches.length === 0) throw err;
    return {
      answer: describeMatches(question, keywordMatches),
      contacts: keywordMatches,
    };
  }

  const cleaned = text
    .replace(/```json?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  let parsed: { answer?: unknown; contactIds?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // If JSON parsing fails, treat the whole response as the answer
    console.error(
      `Contact search returned non-JSON (query: ${JSON.stringify(question)}): ${cleaned.slice(0, 200)}`
    );
    return {
      answer: keywordMatches.length > 0 ? describeMatches(question, keywordMatches) : cleaned,
      contacts: withKeywordMatches([]),
    };
  }

  const ids: unknown[] = Array.isArray(parsed.contactIds)
    ? parsed.contactIds
    : [];

  // Resolve against the list we already loaded. The model is asked for
  // UUIDs but sometimes returns the #index from the prompt instead, so
  // accept either — an unresolvable id is dropped rather than sent to the
  // database, where a non-UUID string would make the query throw.
  const byId = new Map(allContacts.map((c) => [c.id, c]));
  const picked: Person[] = [];
  for (const raw of ids) {
    const id = String(raw);
    const byUuid = byId.get(id);
    const index = /^\d+$/.test(id) ? Number(id) : NaN;
    const match =
      byUuid ??
      (index >= 1 && index <= allContacts.length
        ? allContacts[index - 1]
        : undefined);
    if (match && !picked.includes(match)) picked.push(match);
  }

  const contacts = withKeywordMatches(picked);
  const modelAnswer =
    typeof parsed.answer === "string" && parsed.answer.trim()
      ? parsed.answer
      : "";

  // The model missed contacts that literally contain the query text: its
  // "nothing found" answer would contradict the results, so describe the
  // hits instead.
  const answer =
    picked.length === 0 && keywordMatches.length > 0
      ? describeMatches(question, keywordMatches)
      : modelAnswer || "Sorry, I couldn't generate an answer.";

  console.log(
    `Contact search: query=${JSON.stringify(question)} contacts=${allContacts.length} keywordMatches=${keywordMatches.length} modelPicks=${picked.length}`
  );

  return { answer, contacts };
}

/**
 * Execute a natural language query against the people table.
 * Returns the matching contacts and a summary string.
 */
export async function executeNaturalLanguageQuery(
  userId: string,
  query: string
): Promise<{
  results: Person[];
  summary: string;
}> {
  const { answer, contacts } = await queryContactsFromFullContext(
    userId,
    query
  );

  const results = [...contacts].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );

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

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { people } from "@/db/schema";
import {
  eq,
  and,
  ilike,
  gt,
  lt,
  gte,
  lte,
  isNull,
  isNotNull,
  desc,
  asc,
  type SQL,
} from "drizzle-orm";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your .env.local file."
    );
  }
  return new Anthropic({ apiKey });
}

// The schema description we give to the LLM
const SCHEMA_DESCRIPTION = `The "people" table has these columns:
- name (text, required): Person's full name
- company (text, nullable): Where they work
- role (text, nullable): Job title
- email (text, nullable): Email address
- phone (text, nullable): Phone number
- personalDetails (text, nullable): Personal info (family, hobbies, interests)
- notes (text, nullable): Misc notes
- source (text, nullable): How the user met them
- birthdayMonth (integer, nullable): Birth month 1-12
- birthdayDay (integer, nullable): Birth day 1-31
- children (text, nullable): Info about their children
- createdAt (timestamp): When record was created
- updatedAt (timestamp): When record was last updated`;

const NL_TO_FILTER_PROMPT = `You convert natural language questions about a user's contacts into structured JSON filters.

${SCHEMA_DESCRIPTION}

Return ONLY valid JSON with this shape:
{
  "filters": [
    { "field": "<column_name>", "op": "<operator>", "value": "<value>" }
  ],
  "sort": { "field": "<column_name>", "direction": "asc" | "desc" } | null,
  "summary": "<one sentence describing what this query finds>"
}

Supported operators: eq, ilike, gt, lt, gte, lte, isNull, isNotNull
- For text searches use "ilike" with % wildcards (e.g. "%Google%")
- For date-related queries use birthdayMonth and birthdayDay integers
- "filters" can be an empty array if the query asks for all contacts
- "sort" can be null for default ordering (by updatedAt desc)

Examples:
- "Who works at Google?" → filters: [{"field":"company","op":"ilike","value":"%Google%"}]
- "People with birthdays in March" → filters: [{"field":"birthdayMonth","op":"eq","value":3}]
- "Who have I met recently?" → filters: [], sort: {"field":"createdAt","direction":"desc"}
- "People I met at the conference" → filters: [{"field":"source","op":"ilike","value":"%conference%"}]
- "Contacts without a company" → filters: [{"field":"company","op":"isNull"}]`;

type FilterOp =
  | "eq"
  | "ilike"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "isNull"
  | "isNotNull";

type Filter = {
  field: string;
  op: FilterOp;
  value?: string | number;
};

type NLQueryResult = {
  filters: Filter[];
  sort: { field: string; direction: "asc" | "desc" } | null;
  summary: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COLUMN_MAP: Record<string, any> = {
  name: people.name,
  company: people.company,
  role: people.role,
  email: people.email,
  phone: people.phone,
  personalDetails: people.personalDetails,
  notes: people.notes,
  source: people.source,
  birthdayMonth: people.birthdayMonth,
  birthdayDay: people.birthdayDay,
  children: people.children,
  createdAt: people.createdAt,
  updatedAt: people.updatedAt,
};

function buildWhereCondition(filter: Filter): SQL | null {
  const col = COLUMN_MAP[filter.field];
  if (!col) return null;

  switch (filter.op) {
    case "eq":
      return eq(col, filter.value as never);
    case "ilike":
      return ilike(col, filter.value as string);
    case "gt":
      return gt(col, filter.value as never);
    case "lt":
      return lt(col, filter.value as never);
    case "gte":
      return gte(col, filter.value as never);
    case "lte":
      return lte(col, filter.value as never);
    case "isNull":
      return isNull(col);
    case "isNotNull":
      return isNotNull(col);
    default:
      return null;
  }
}

/**
 * Parse a natural language query into structured filters using Claude.
 */
export async function parseNaturalLanguageQuery(
  query: string
): Promise<NLQueryResult> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    system: NL_TO_FILTER_PROMPT,
    messages: [{ role: "user", content: query }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "{}";

  const cleaned = text
    .replace(/```json?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  return {
    filters: Array.isArray(parsed.filters) ? parsed.filters : [],
    sort: parsed.sort ?? null,
    summary: parsed.summary || "Contacts matching your query",
  };
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
  const parsed = await parseNaturalLanguageQuery(query);

  // Build where conditions -- always scoped to the user
  const conditions: SQL[] = [eq(people.userId, userId)];

  for (const filter of parsed.filters) {
    const condition = buildWhereCondition(filter);
    if (condition) {
      conditions.push(condition);
    }
  }

  // Build sort
  let orderBy;
  if (parsed.sort && COLUMN_MAP[parsed.sort.field]) {
    const col = COLUMN_MAP[parsed.sort.field];
    orderBy = parsed.sort.direction === "asc" ? asc(col) : desc(col);
  } else {
    orderBy = desc(people.updatedAt);
  }

  const results = await db
    .select()
    .from(people)
    .where(and(...conditions))
    .orderBy(orderBy);

  return { results, summary: parsed.summary };
}

/**
 * Answer a natural language question about contacts.
 * Runs the query, then passes results through Claude for a human-friendly answer.
 * Used by the Telegram bot Q&A flow.
 */
export async function answerContactQuestion(
  userId: string,
  question: string
): Promise<string> {
  const { results, summary } = await executeNaturalLanguageQuery(
    userId,
    question
  );

  if (results.length === 0) {
    return `I searched your contacts but couldn't find anyone matching: "${question}"`;
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

  // Format results as a compact summary for the LLM
  const contactSummaries = results.slice(0, 20).map((p) => {
    const parts = [`Name: ${p.name}`];
    if (p.company) parts.push(`Company: ${p.company}`);
    if (p.role) parts.push(`Role: ${p.role}`);
    if (p.email) parts.push(`Email: ${p.email}`);
    if (p.phone) parts.push(`Phone: ${p.phone}`);
    if (p.personalDetails) parts.push(`Details: ${p.personalDetails}`);
    if (p.notes) parts.push(`Notes: ${p.notes}`);
    if (p.source) parts.push(`Met via: ${p.source}`);
    if (p.birthdayMonth && p.birthdayDay)
      parts.push(
        `Birthday: ${MONTH_NAMES[p.birthdayMonth]} ${p.birthdayDay}`
      );
    if (p.children) parts.push(`Children: ${p.children}`);
    return parts.join(", ");
  });

  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: `You are a helpful assistant answering questions about a user's personal contacts. Based on the search results provided, give a clear, concise answer to the user's question. If results are truncated, mention that more may exist. Keep answers brief and conversational.`,
    messages: [
      {
        role: "user",
        content: `Question: ${question}\n\nQuery summary: ${summary}\n\nFound ${results.length} contact(s):\n${contactSummaries.join("\n---\n")}${results.length > 20 ? `\n\n(showing first 20 of ${results.length} results)` : ""}`,
      },
    ],
  });

  return message.content[0].type === "text"
    ? message.content[0].text
    : "Sorry, I couldn't generate an answer.";
}

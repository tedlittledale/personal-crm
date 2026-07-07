import { anthropic } from "@ai-sdk/anthropic";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { executeNaturalLanguageQuery } from "@/lib/nl-query";
import { getContactById, type ContactInput } from "@/lib/contacts";
import {
  proposePendingAction,
  formatDueAt,
  type PendingActionPayload,
} from "@/lib/agent/pending-actions";

// Keep the same cost-efficient model the Q&A flow already uses. Swap for
// "claude-sonnet-4-20250514" if tool-calling reliability becomes an issue.
const AGENT_MODEL = "claude-haiku-4-5-20251001";

/** Editable contact fields shared by the create/update tools. */
const contactFieldSchema = {
  company: z.string().nullish(),
  role: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  personalDetails: z.string().nullish(),
  notes: z.string().nullish(),
  source: z.string().nullish(),
  birthdayMonth: z.number().int().min(1).max(12).nullish(),
  birthdayDay: z.number().int().min(1).max(31).nullish(),
  children: z.string().nullish(),
};

/** Build a human-readable summary of the fields being set on a contact. */
function describeFields(fields: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    company: "company",
    role: "role",
    email: "email",
    phone: "phone",
    address: "address",
    personalDetails: "personal details",
    notes: "notes",
    source: "how you met",
    birthdayMonth: "birthday month",
    birthdayDay: "birthday day",
    children: "children",
  };
  const parts: string[] = [];
  for (const [key, label] of Object.entries(labels)) {
    const value = fields[key];
    if (value !== undefined && value !== null && value !== "") {
      parts.push(`${label}: ${value}`);
    }
  }
  return parts.join(", ");
}

/** Strip undefined values so only fields the model actually set are applied. */
function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

export type AgentContext = {
  userId: string;
  chatId: string;
  timezone: string;
};

function buildSystemPrompt(ctx: AgentContext): string {
  const now = new Date();
  return `You are the assistant for a personal CRM ("People Notes"). The user talks to you over Telegram to look up, add, and update their contacts, and to set follow-up reminders.

Current time: ${now.toISOString()} (UTC). The user's timezone is ${ctx.timezone}. Their local time is ${formatDueAt(now, ctx.timezone)}. Use this to resolve relative dates like "next Tuesday" or "in two weeks".

What you can do:
- Answer questions about the user's contacts (use searchContacts).
- Add a new contact (proposeCreateContact).
- Update an existing contact (proposeUpdateContact).
- Set a reminder to follow up (proposeCreateReminder).

Rules:
- To update a contact or attach a reminder to one, FIRST call searchContacts to find it and its contactId. Never invent a contactId.
- If more than one contact matches, ask the user which one they mean before doing anything.
- All changes (create/update/reminder) are PROPOSALS that require the user's confirmation. After calling a propose* tool, tell the user exactly what you're about to do and ask them to reply "yes" to confirm. Do NOT claim the change is done — it is not applied until they confirm.
- Do one change at a time.
- For reminders, convert the requested time into an absolute ISO 8601 datetime (dueAtISO). If no time of day is given, default to 09:00 in the user's timezone.
- Keep replies short and friendly for a chat window. Use plain text, not tables.`;
}

/**
 * Run the tool-calling CRM agent for one inbound Telegram message and return
 * the reply text to send back. Read tools act immediately; write tools stage a
 * pending action for the user to confirm on their next message.
 */
export async function runCrmAgent(
  ctx: AgentContext,
  message: string
): Promise<string> {
  const { userId, chatId, timezone } = ctx;

  const tools = {
    searchContacts: tool({
      description:
        "Search the user's contacts by name or description and answer questions about them. Returns matching contacts with their contactId.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("What to look for, e.g. a name or 'people at Acme'"),
      }),
      execute: async ({ query }) => {
        const { results, summary } = await executeNaturalLanguageQuery(
          userId,
          query
        );
        return {
          summary,
          contacts: results.slice(0, 10).map((p) => ({
            contactId: p.id,
            name: p.name,
            company: p.company,
            role: p.role,
          })),
        };
      },
    }),

    getContactDetails: tool({
      description:
        "Get the full details of a single contact by its contactId (obtained from searchContacts).",
      inputSchema: z.object({
        contactId: z.string(),
      }),
      execute: async ({ contactId }) => {
        const contact = await getContactById(userId, contactId);
        if (!contact) return { error: "No contact with that id." };
        return {
          contactId: contact.id,
          name: contact.name,
          company: contact.company,
          role: contact.role,
          email: contact.email,
          phone: contact.phone,
          address: contact.address,
          personalDetails: contact.personalDetails,
          notes: contact.notes,
          source: contact.source,
          birthdayMonth: contact.birthdayMonth,
          birthdayDay: contact.birthdayDay,
          children: contact.children,
        };
      },
    }),

    proposeCreateContact: tool({
      description:
        "Propose creating a new contact. Requires the user's confirmation before it is saved.",
      inputSchema: z.object({
        name: z.string().min(1),
        ...contactFieldSchema,
      }),
      execute: async ({ name, ...fields }) => {
        const input = { name, ...pickDefined(fields) } as ContactInput;
        const detail = describeFields(fields);
        const summary = `Add a new contact: ${name}${detail ? ` (${detail})` : ""}`;
        const action: PendingActionPayload = { type: "createContact", input };
        await proposePendingAction(userId, chatId, action, summary);
        return { staged: true, summary };
      },
    }),

    proposeUpdateContact: tool({
      description:
        "Propose updating fields on an existing contact. Requires the user's confirmation before it is applied. Only include the fields you want to change.",
      inputSchema: z.object({
        contactId: z.string().describe("From searchContacts"),
        contactName: z
          .string()
          .describe("The contact's name, for the confirmation message"),
        ...contactFieldSchema,
      }),
      execute: async ({ contactId, contactName, ...fields }) => {
        const patch = pickDefined(fields) as Partial<ContactInput>;
        const detail = describeFields(fields);
        const summary = detail
          ? `Update ${contactName} — set ${detail}`
          : `Update ${contactName}`;
        const action: PendingActionPayload = {
          type: "updateContact",
          contactId,
          contactName,
          patch,
        };
        await proposePendingAction(userId, chatId, action, summary);
        return { staged: true, summary };
      },
    }),

    proposeCreateReminder: tool({
      description:
        "Propose a follow-up reminder delivered via Telegram at the given time. Requires the user's confirmation.",
      inputSchema: z.object({
        text: z.string().min(1).describe("What to remind the user about"),
        dueAtISO: z
          .string()
          .describe("Absolute ISO 8601 datetime for when to send the reminder"),
        contactId: z
          .string()
          .nullish()
          .describe("Optional contactId this reminder is about"),
        personName: z.string().nullish(),
      }),
      execute: async ({ text, dueAtISO, contactId, personName }) => {
        const dueAt = new Date(dueAtISO);
        if (isNaN(dueAt.getTime())) {
          return { error: "dueAtISO was not a valid date." };
        }
        const when = formatDueAt(dueAt, timezone);
        const about = personName ? ` (about ${personName})` : "";
        const summary = `Set a reminder for ${when}: "${text}"${about}`;
        const action: PendingActionPayload = {
          type: "createReminder",
          personId: contactId ?? null,
          personName: personName ?? null,
          text,
          dueAtISO,
        };
        await proposePendingAction(userId, chatId, action, summary);
        return { staged: true, summary };
      },
    }),
  };

  const { text } = await generateText({
    model: anthropic(AGENT_MODEL),
    system: buildSystemPrompt(ctx),
    prompt: message,
    tools,
    stopWhen: stepCountIs(5),
  });

  return (
    text.trim() ||
    "Sorry, I couldn't come up with a reply. Could you rephrase that?"
  );
}

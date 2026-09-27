import { anthropic } from "@ai-sdk/anthropic";
import { generateText, tool, stepCountIs, type ModelMessage } from "ai";
import { z } from "zod";
import { executeNaturalLanguageQuery } from "@/lib/nl-query";
import { getContactById, type ContactInput } from "@/lib/contacts";
import {
  proposePendingAction,
  formatDueAt,
  type PendingActionPayload,
} from "@/lib/agent/pending-actions";
import {
  loadConversationHistory,
  appendConversationMessages,
  SCHEDULED_MESSAGE_MARKER,
} from "@/lib/agent/conversation";
import {
  listGiftIdeas,
  addGiftIdeas,
  deleteGiftIdeas,
  getGiftIdea,
  type GiftPatch,
} from "@/lib/gifts";
import {
  formatOccasion,
  giftOccasion,
  isLive,
  localDate,
  GIFT_STATUSES,
} from "@/lib/gift-occasions";

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

/** How long after adding gift ideas an "undo" can delete them without a confirmation. */
const GIFT_UNDO_WINDOW_MS = 30 * 60 * 1000;

/** Occasion fields shared by the gift tools. All optional: gaps are filled with the next upcoming date. */
const giftOccasionSchema = {
  occasionType: z
    .enum(["birthday", "christmas", "other"])
    .nullish()
    .describe(
      "Only if the user named an occasion. Leave empty to file under the person's next birthday or Christmas, whichever comes first."
    ),
  occasionYear: z
    .number()
    .int()
    .nullish()
    .describe("Only if the user named a year, e.g. 'Christmas next year'."),
  occasionLabel: z
    .string()
    .nullish()
    .describe("Name of an 'other' occasion, e.g. 'Anniversary'."),
};

const giftIdeaListSchema = z
  .array(
    z.object({
      idea: z.string().min(1).describe("The gift, e.g. 'microscope'"),
      notes: z.string().nullish().describe("Optional link, price, size..."),
    })
  )
  .min(1);

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
- Keep gift lists: save present ideas for a contact (addGiftIdeas), show them (listGiftIdeas), and mark them bought/given/dropped or move them (proposeUpdateGiftIdeas).

Rules:
- You see the recent conversation, not just the latest message. Read each message in that context. If you asked a question and the user replies with a short answer (a number, a name, "the first one", "yes the birthday"), it answers your question: act on it, do not treat it as a new request or ask again.
- If the message is just a name, word, or short phrase with no explicit request (e.g. "Tony Cowen", "bunny tales") and it is not answering something you asked, treat it as a search: call searchContacts with it immediately. The search matches against every field (name, company, role, notes, personal details, how you met, etc.), so pass the term as-is. Only ask what they meant if the search finds nothing relevant — and then offer to add it as a new contact.
- A proposal is applied only when a later message in the conversation shows a ✅ confirmation. If the user replied to a proposal with anything other than a confirmation, that proposal was dropped: if they want a changed version, call the propose tool again with the new details. Never assume an earlier proposal is still pending.
- If searchContacts returns an error, tell the user the search failed and to try again. Never present a failed search as "no contacts found".
- To update a contact or attach a reminder to one, FIRST call searchContacts to find it and its contactId. Never invent a contactId.
- If more than one contact matches, ask the user which one they mean before doing anything.
- All changes (create/update/reminder), except saving and undoing gift ideas, are PROPOSALS that require the user's confirmation. After calling a propose* tool, tell the user exactly what you're about to do and ask them to reply "yes" to confirm. Do NOT claim the change is done — it is not applied until they confirm.
- Do one change at a time.

Gift ideas:
- Messages like "present idea for Olly - microscope", "gift ideas Olly: lego, a book" or "Olly would love a microscope for Christmas" mean: find the contact with searchContacts, then call addGiftIdeas. Several ideas in one message go in one addGiftIdeas call.
- Only set the occasion if the user named one ("for his birthday", "for Christmas next year"). Otherwise leave it empty and it is filed under the person's next birthday or Christmas.
- addGiftIdeas saves immediately (no "yes" needed). Reply with what was saved and where, e.g. "Saved microscope to Olly's list (Christmas 2026). Reply 'undo' to remove." If the user then says "undo", call undoGiftIdeas with the giftIds from that save.
- searchContacts also matches the children field, so a search for "Olly" can return Olly's parent. Only use a contact whose name is the person. If the only match is a parent whose children mention the name, or nothing matches, offer to add them as a new contact with proposeCreateContact, passing the gift ideas in giftIdeas and a note like "Child of Sam Smith" in notes. Say that the ideas will be saved once they confirm.
- Marking gifts bought/given/dropped, moving them to another occasion or editing them needs confirmation via proposeUpdateGiftIdeas. Call listGiftIdeas first to get the giftIds. Several gifts getting the same change (e.g. "gave him the microscope and the lego") go in one call.
- A user message reading "${SCHEDULED_MESSAGE_MARKER}" was not written by the user: it marks that the assistant message after it was sent automatically (a birthday nudge, the Christmas roundup, or a "did you give any of these?" check-in). Read the user's next reply against that message. E.g. after a check-in, "gave him the microscope" means mark that gift as given.
- When listing, the live list is ideas not yet acted on plus gifts bought for an upcoming occasion. Ideas filed under an occasion that has passed still show; mention which occasion they were filed under. Use includeHistory for questions about past years.
- For reminders, convert the requested time into an absolute ISO 8601 datetime (dueAtISO). If no time of day is given, default to 09:00 in the user's timezone.
- Keep replies short and friendly for a chat window. Use plain text only — no tables and no markdown formatting like **bold** (messages are sent as plain text, so asterisks show up literally).`;
}

/**
 * Run the tool-calling CRM agent for one inbound Telegram message and return
 * the reply text to send back. Read tools act immediately; write tools stage a
 * pending action for the user to confirm on their next message.
 *
 * The recent conversation for the chat is loaded from the database and sent
 * ahead of the new message, and this turn (user message, tool calls, tool
 * results, reply) is appended afterwards, so follow-up replies are understood.
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
        try {
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
        } catch (err) {
          // The AI SDK turns a thrown tool error into a tool-result the model
          // reads, so it never reaches the webhook's catch — log it here or it
          // is invisible in production.
          console.error("searchContacts failed:", err);
          return { error: "Failed to search contacts due to a technical error." };
        }
      },
    }),

    getContactDetails: tool({
      description:
        "Get the full details of a single contact by its contactId (obtained from searchContacts).",
      inputSchema: z.object({
        contactId: z.string(),
      }),
      execute: async ({ contactId }) => {
        try {
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
        } catch (err) {
          console.error("getContactDetails failed:", err);
          return { error: "Failed to load contact due to a technical error." };
        }
      },
    }),

    proposeCreateContact: tool({
      description:
        "Propose creating a new contact. Requires the user's confirmation before it is saved. If the user was adding gift ideas for someone who isn't a contact yet, pass them as giftIdeas and they are saved to the new contact's list on confirmation.",
      inputSchema: z.object({
        name: z.string().min(1),
        ...contactFieldSchema,
        giftIdeas: giftIdeaListSchema.nullish(),
        ...giftOccasionSchema,
      }),
      execute: async ({
        name,
        giftIdeas,
        occasionType,
        occasionYear,
        occasionLabel,
        ...fields
      }) => {
        const input = { name, ...pickDefined(fields) } as ContactInput;
        const detail = describeFields(fields);
        const gifts = giftIdeas?.length
          ? ` and save gift ideas: ${giftIdeas.map((g) => g.idea).join(", ")}`
          : "";
        const summary = `Add a new contact: ${name}${detail ? ` (${detail})` : ""}${gifts}`;
        const action: PendingActionPayload = {
          type: "createContact",
          input,
          ...(giftIdeas?.length && {
            giftIdeas: {
              ideas: giftIdeas,
              occasion: {
                type: occasionType,
                year: occasionYear,
                label: occasionLabel,
              },
            },
          }),
        };
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

    listGiftIdeas: tool({
      description:
        "List gift ideas, for one contact or across everyone. By default returns the live list: ideas not yet acted on (whatever year they were filed under) and gifts bought for an upcoming occasion. Set includeHistory to also get given gifts and past occasions, e.g. 'what did I get Olly last Christmas?'.",
      inputSchema: z.object({
        contactId: z.string().nullish().describe("From searchContacts; omit for everyone"),
        occasionType: z.enum(["birthday", "christmas", "other"]).nullish(),
        year: z.number().int().nullish(),
        includeHistory: z.boolean().nullish(),
      }),
      execute: async ({ contactId, occasionType, year, includeHistory }) => {
        try {
          const today = localDate(new Date(), timezone);
          const gifts = await listGiftIdeas(userId, {
            personId: contactId ?? undefined,
            occasionType: occasionType ?? undefined,
            year: year ?? undefined,
          });
          return {
            gifts: gifts
              .filter((g) => includeHistory || isLive(g, g, today))
              .map((g) => ({
                giftId: g.id,
                person: g.personName,
                idea: g.idea,
                notes: g.notes,
                occasion: formatOccasion(giftOccasion(g)),
                status: g.status,
              })),
          };
        } catch (err) {
          console.error("listGiftIdeas failed:", err);
          return { error: "Failed to load gift ideas due to a technical error." };
        }
      },
    }),

    addGiftIdeas: tool({
      description:
        "Save one or more gift ideas to an existing contact's gift list. Saved immediately, no confirmation needed. The contact must come from searchContacts.",
      inputSchema: z.object({
        contactId: z.string().describe("From searchContacts"),
        ideas: giftIdeaListSchema,
        ...giftOccasionSchema,
      }),
      execute: async ({ contactId, ideas, occasionType, occasionYear, occasionLabel }) => {
        try {
          const saved = await addGiftIdeas(
            userId,
            contactId,
            ideas,
            { type: occasionType, year: occasionYear, label: occasionLabel },
            timezone
          );
          if (!saved) return { error: "No contact with that id." };
          return {
            saved: true,
            person: saved.personName,
            occasion: formatOccasion(saved.occasion),
            giftIds: saved.gifts.map((g) => g.id),
            ideas: saved.gifts.map((g) => g.idea),
          };
        } catch (err) {
          console.error("addGiftIdeas failed:", err);
          return { error: "Failed to save gift ideas due to a technical error." };
        }
      },
    }),

    undoGiftIdeas: tool({
      description:
        "Undo a recent addGiftIdeas call by deleting the gift ideas it just saved. Only works for ideas added in the last 30 minutes; for older ones use proposeUpdateGiftIdeas with status 'dropped'.",
      inputSchema: z.object({
        giftIds: z.array(z.string()).min(1).describe("giftIds returned by addGiftIdeas"),
      }),
      execute: async ({ giftIds }) => {
        try {
          const deleted = await deleteGiftIdeas(userId, giftIds, {
            createdAfter: new Date(Date.now() - GIFT_UNDO_WINDOW_MS),
          });
          return { deleted };
        } catch (err) {
          console.error("undoGiftIdeas failed:", err);
          return { error: "Failed to undo due to a technical error." };
        }
      },
    }),

    proposeUpdateGiftIdeas: tool({
      description:
        "Propose changing one or more gift ideas in one go: mark them bought, given or dropped, move them to another occasion, or edit one. Requires the user's confirmation. Get giftIds from listGiftIdeas.",
      inputSchema: z.object({
        gifts: z
          .array(
            z.object({
              giftId: z.string().describe("From listGiftIdeas"),
              giftName: z.string().describe("The gift idea, for the confirmation message"),
              personName: z.string().describe("Who it is for, for the confirmation message"),
            })
          )
          .min(1),
        status: z.enum(GIFT_STATUSES).nullish(),
        occasionType: z.enum(["birthday", "christmas", "other"]).nullish(),
        occasionYear: z.number().int().nullish(),
        occasionLabel: z.string().nullish(),
        idea: z.string().nullish().describe("New wording (only when changing a single idea)"),
        notes: z.string().nullish().describe("Only when changing a single idea"),
      }),
      execute: async ({ gifts, ...fields }) => {
        if ((fields.idea || fields.notes) && gifts.length > 1) {
          return { error: "Rename or add notes to one gift idea at a time." };
        }
        for (const { giftId } of gifts) {
          if (!(await getGiftIdea(userId, giftId))) {
            return { error: `No gift idea with id ${giftId}. Call listGiftIdeas to find it.` };
          }
        }
        const patch = pickDefined({
          status: fields.status ?? undefined,
          occasionType: fields.occasionType ?? undefined,
          occasionYear: fields.occasionYear ?? undefined,
          occasionLabel: fields.occasionLabel ?? undefined,
          idea: fields.idea ?? undefined,
          notes: fields.notes ?? undefined,
        }) as GiftPatch;
        const changes: string[] = [];
        if (patch.status) changes.push(`mark as ${patch.status}`);
        if (patch.occasionType || patch.occasionYear) {
          changes.push(
            `move to ${[patch.occasionLabel ?? patch.occasionType, patch.occasionYear]
              .filter(Boolean)
              .join(" ")}`
          );
        }
        if (patch.idea) changes.push(`rename to "${patch.idea}"`);
        if (patch.notes) changes.push(`set notes: ${patch.notes}`);
        if (changes.length === 0) return { error: "No changes given." };
        const which = gifts.map((g) => `${g.personName}'s ${g.giftName}`).join(", ");
        const summary = `Gift ideas (${which}): ${changes.join(", ")}`;
        const action: PendingActionPayload = {
          type: "updateGiftIdeas",
          giftIds: gifts.map((g) => g.giftId),
          patch,
        };
        await proposePendingAction(userId, chatId, action, summary);
        return { staged: true, summary };
      },
    }),
  };

  const history = await loadConversationHistory(chatId);
  const userMessage: ModelMessage = { role: "user", content: message };

  const { text, response } = await generateText({
    model: anthropic(AGENT_MODEL),
    system: buildSystemPrompt(ctx),
    messages: [...history, userMessage],
    tools,
    stopWhen: stepCountIs(5),
  });

  // Replies go out via plain-text sendMessage, where markdown bold shows up
  // as literal asterisks — the model uses it despite being told not to.
  const reply =
    text.trim().replace(/\*\*/g, "") ||
    "Sorry, I couldn't come up with a reply. Could you rephrase that?";

  // Persist this turn so the next webhook call sees it. response.messages
  // holds the assistant and tool messages generated across all steps.
  // History is best-effort: a failure here must not lose the reply.
  try {
    await appendConversationMessages(userId, chatId, [
      userMessage,
      ...response.messages,
    ]);
  } catch (err) {
    console.error("Failed to save conversation history:", err);
  }

  return reply;
}

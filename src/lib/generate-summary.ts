import Anthropic from "@anthropic-ai/sdk";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your .env.local file."
    );
  }
  return new Anthropic({ apiKey });
}

type ContactFields = {
  name: string;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  personalDetails?: string | null;
  notes?: string | null;
  source?: string | null;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
  children?: string | null;
};

const SUMMARY_PROMPT = `You generate a short one-sentence summary of a contact for display in a contacts list. The summary should help the user quickly remember who this person is when scrolling through their contacts.

Rules:
- Write exactly ONE concise sentence (under 120 characters if possible)
- Focus on the most identifying or memorable details (role, company, how they met, personal connection)
- Do not start with the person's name (it's already shown separately in the UI)
- Write in a natural, informal tone
- If very little information is available, summarize what you have
- Do not include email or phone — those are shown elsewhere
- Return ONLY the summary sentence, nothing else`;

function formatContact(contact: ContactFields): string {
  const lines: string[] = [`Name: ${contact.name}`];
  if (contact.role) lines.push(`Role: ${contact.role}`);
  if (contact.company) lines.push(`Company: ${contact.company}`);
  if (contact.source) lines.push(`How we met: ${contact.source}`);
  if (contact.personalDetails)
    lines.push(`Personal details: ${contact.personalDetails}`);
  if (contact.notes) lines.push(`Notes: ${contact.notes}`);
  if (contact.children) lines.push(`Children: ${contact.children}`);
  if (contact.birthdayMonth && contact.birthdayDay)
    lines.push(`Birthday: ${contact.birthdayMonth}/${contact.birthdayDay}`);
  return lines.join("\n");
}

export async function generateContactSummary(
  contact: ContactFields
): Promise<string> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    system: SUMMARY_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate a one-sentence summary for this contact:\n\n${formatContact(contact)}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  return text.trim();
}

const CHANGE_DESCRIPTION_PROMPT = `You summarize what changed when a contact was updated. You will receive the before and after state of a contact record.

Rules:
- Write exactly ONE concise sentence (under 120 characters if possible)
- Describe what was added, changed, or removed in plain language
- Use past tense (e.g. "Added phone number and updated role to CTO")
- Focus on the meaningful changes, not every tiny edit
- If a field went from empty to filled, say "Added [field]"
- If a field changed values, say "Updated [field] to [new value]" (only include new value if short)
- If a field was cleared, say "Removed [field]"
- Do not mention the person's name
- Return ONLY the description sentence, nothing else`;

function describeChanges(before: ContactFields, after: ContactFields): string {
  const fields: { key: keyof ContactFields; label: string }[] = [
    { key: "company", label: "company" },
    { key: "role", label: "role" },
    { key: "email", label: "email" },
    { key: "phone", label: "phone" },
    { key: "personalDetails", label: "personal details" },
    { key: "notes", label: "notes" },
    { key: "source", label: "source" },
    { key: "birthdayMonth", label: "birthday" },
    { key: "children", label: "children" },
  ];

  const changes: string[] = [];
  for (const { key, label } of fields) {
    const oldVal = before[key] ?? "";
    const newVal = after[key] ?? "";
    if (String(oldVal) !== String(newVal)) {
      changes.push(`${label}: "${oldVal || "(empty)"}" → "${newVal || "(empty)"}"`);
    }
  }
  return changes.join("\n");
}

export async function generateChangeDescription(
  before: ContactFields,
  after: ContactFields
): Promise<string> {
  const changeDiff = describeChanges(before, after);
  if (!changeDiff) return "";

  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    system: CHANGE_DESCRIPTION_PROMPT,
    messages: [
      {
        role: "user",
        content: `Contact: ${after.name}\n\nChanges:\n${changeDiff}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  return text.trim();
}

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ExtractedPerson } from "./extract";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your .env.local file."
    );
  }
  return new Anthropic({ apiKey });
}

// Schema for a single contact extracted by the AI.
// Uses coerce/transform to handle AI returning slightly off shapes
// (e.g. missing fields, empty strings instead of null, snake_case keys).
const contactSchema = z
  .object({
    name: z.string().min(1),
    company: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    personalDetails: z.string().nullable().optional(),
    personal_details: z.string().nullable().optional(), // handle snake_case variant
    notes: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    birthdayMonth: z.number().nullable().optional(),
    birthday_month: z.number().nullable().optional(), // handle snake_case variant
    birthdayDay: z.number().nullable().optional(),
    birthday_day: z.number().nullable().optional(), // handle snake_case variant
    children: z.string().nullable().optional(),
  })
  .transform(
    (val): ExtractedPerson => ({
      name: val.name.trim(),
      company: val.company?.trim() || null,
      role: val.role?.trim() || null,
      email: val.email?.trim() || null,
      phone: val.phone?.trim() || null,
      personalDetails:
        val.personalDetails?.trim() || val.personal_details?.trim() || null,
      notes: val.notes?.trim() || null,
      source: val.source?.trim() || null,
      birthdayMonth: val.birthdayMonth ?? val.birthday_month ?? null,
      birthdayDay: val.birthdayDay ?? val.birthday_day ?? null,
      children: val.children?.trim() || null,
    })
  );

// Schema for the full AI response -- an array of contacts.
// Filters out entries that fail validation (e.g. missing name) rather than
// throwing, so one bad row doesn't break the whole import.
const contactsResponseSchema = z.array(z.unknown()).transform((items) => {
  const results: ExtractedPerson[] = [];
  for (const item of items) {
    const parsed = contactSchema.safeParse(item);
    if (parsed.success) {
      results.push(parsed.data);
    }
  }
  return results;
});

const EXTRACT_CONTACTS_PROMPT = `You are a data extraction assistant. Your job is to find ALL contacts/people mentioned in the provided file content and extract structured information about each one.

The file content could be in any format: CSV, TSV, spreadsheet data, plain text notes, JSON, markdown, or any other format. Analyze the structure and extract every person you can find.

Return ONLY a valid JSON array of objects. Each object must have these fields:
- name (string, required): The person's full name
- company (string or null): Where they work / their organization
- role (string or null): Their job title or role
- email (string or null): Their email address if available
- phone (string or null): Their phone number if available
- personalDetails (string or null): Personal information like family, pets, hobbies, interests, preferences
- notes (string or null): Any other relevant information that doesn't fit above
- source (string or null): Where/how the user knows this person, or any context about the relationship
- birthdayMonth (number or null): The month of their birthday (1-12) if available
- birthdayDay (number or null): The day of their birthday (1-31) if available
- children (string or null): Information about their children (names, ages, etc.)

Rules:
- Return ONLY the JSON array, no other text
- If a field isn't available for a person, set it to null
- Every entry MUST have a name. Skip entries that don't have a name
- Combine related information intelligently (e.g. if there are separate first/last name columns, merge them into "name")
- If the data has columns/fields that don't map to the above fields, include that information in "notes"
- For birthdays, only extract the month and day -- do NOT include the year
- Write in clear, concise language
- Do NOT invent or hallucinate information that isn't in the source data`;

/**
 * Extract multiple contacts from arbitrary file content using AI.
 * Handles CSV, plain text, spreadsheet data, JSON, or any other format.
 */
export async function extractContactsFromFile(
  fileContent: string
): Promise<ExtractedPerson[]> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: EXTRACT_CONTACTS_PROMPT,
    messages: [
      {
        role: "user",
        content: `Extract all contacts from this file content:\n\n${fileContent}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "[]";

  // Parse the JSON response, stripping any markdown fences
  const cleaned = text
    .replace(/```json?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  const raw = JSON.parse(cleaned);

  if (!Array.isArray(raw)) {
    throw new Error("AI response was not an array of contacts");
  }

  // Validate and transform through the schema -- malformed entries are
  // silently dropped rather than crashing the whole import.
  return contactsResponseSchema.parse(raw);
}

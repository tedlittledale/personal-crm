import Anthropic from "@anthropic-ai/sdk";
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

const EXTRACT_CONTACTS_PROMPT = `You are a data extraction assistant. Your job is to find ALL contacts/people mentioned in the provided file content and extract structured information about each one.

The file content could be in any format: CSV, TSV, spreadsheet data, plain text notes, JSON, markdown, or any other format. Analyze the structure and extract every person you can find.

Return ONLY a valid JSON array of objects. Each object must have these fields:
- name (string, required): The person's full name
- company (string or null): Where they work / their organization
- role (string or null): Their job title or role
- personalDetails (string or null): Personal information like family, pets, hobbies, interests, preferences
- notes (string or null): Any other relevant information that doesn't fit above
- source (string or null): Where/how the user knows this person, or any context about the relationship

Rules:
- Return ONLY the JSON array, no other text
- If a field isn't available for a person, set it to null
- Every entry MUST have a name. Skip entries that don't have a name
- Combine related information intelligently (e.g. if there are separate first/last name columns, merge them into "name")
- If the data has columns/fields that don't map to the above fields, include that information in "notes"
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
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error("AI response was not an array of contacts");
  }

  return parsed.map(
    (entry: Record<string, unknown>): ExtractedPerson => ({
      name: (entry.name as string) || "Unknown",
      company: (entry.company as string) || null,
      role: (entry.role as string) || null,
      personalDetails:
        (entry.personalDetails as string) ||
        (entry.personal_details as string) ||
        null,
      notes: (entry.notes as string) || null,
      source: (entry.source as string) || null,
    })
  );
}

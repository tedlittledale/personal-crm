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

export type ExtractedPerson = {
  name: string;
  company: string | null;
  role: string | null;
  personalDetails: string | null;
  notes: string | null;
  source: string | null;
};

const TIDY_PROMPT = `You are a transcript editor. Your job is to clean up a raw voice note transcript and return a corrected version. Return ONLY the cleaned transcript text, nothing else.

Fix the following issues:
- Misspelled company names (e.g. "Gooogle" → "Google", "Microsft" → "Microsoft", "Ammzon" → "Amazon")
- Misspelled people's names where you can reasonably infer the correct spelling
- Misspelled technology terms, job titles, and industry jargon
- Obvious transcription errors (e.g. homophones like "their" vs "they're", "to" vs "too")
- Remove excessive filler words (um, uh, like, you know) while preserving natural phrasing
- Fix grammatical errors introduced by speech-to-text

Do NOT change the meaning or add information that wasn't there. Keep the same overall structure and content. If you're unsure about a correction, leave the original text.`;

const EXTRACT_PROMPT = `You extract structured information about a person from voice note transcripts. Return ONLY valid JSON, no other text.

The JSON must have these fields:
- name (string, required): The person's full name
- company (string or null): Where they work
- role (string or null): Their job title or role
- personalDetails (string or null): Personal information like family, pets, hobbies, interests, preferences
- notes (string or null): Any other relevant information that doesn't fit above
- source (string or null): Where/how the speaker met this person (event, introduction, context)

If a field isn't mentioned in the transcript, set it to null. Write in clear, concise language.`;

async function tidyTranscript(transcript: string): Promise<string> {
  const anthropic = getClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: TIDY_PROMPT,
    messages: [
      {
        role: "user",
        content: `Clean up this voice note transcript:\n\n${transcript}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : transcript;

  return text.trim();
}

export async function extractPersonFromTranscript(
  transcript: string
): Promise<ExtractedPerson & { tidiedTranscript: string }> {
  const anthropic = getClient();

  // Step 1: Tidy the transcript to fix errors before extraction
  const tidiedTranscript = await tidyTranscript(transcript);

  // Step 2: Extract structured data from the cleaned transcript
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: EXTRACT_PROMPT,
    messages: [
      {
        role: "user",
        content: `Extract information about the person from this voice note transcript:\n\n${tidiedTranscript}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Parse the JSON response, stripping any markdown fences
  const cleaned = text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    name: parsed.name || "Unknown",
    company: parsed.company || null,
    role: parsed.role || null,
    personalDetails: parsed.personalDetails || parsed.personal_details || null,
    notes: parsed.notes || null,
    source: parsed.source || null,
    tidiedTranscript,
  };
}

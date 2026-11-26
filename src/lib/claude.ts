import type Anthropic from "@anthropic-ai/sdk";

/**
 * The Claude model for extraction, file import and contact summaries.
 * claude-sonnet-4-20250514 was retired, and every call to it failed.
 */
export const CLAUDE_MODEL = "claude-sonnet-5-5";

/**
 * The reply's text. Current models think first, so the reply can open with a
 * thinking block: read the first text block rather than content[0].
 */
export function replyText(message: Anthropic.Message, fallback = ""): string {
  const block = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return block ? block.text : fallback;
}

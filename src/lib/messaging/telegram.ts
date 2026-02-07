import type { MessagingProvider } from "./types";

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is not set. Add it to your .env.local file."
    );
  }
  return token;
}

/**
 * Send a Telegram message using the Bot API directly via fetch.
 * This avoids importing the grammy Bot class at module scope,
 * which would fail during the Next.js build when env vars aren't set.
 */
async function callTelegramApi(
  method: string,
  params: Record<string, unknown>
): Promise<void> {
  const token = getBotToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error (${method}): ${res.status} - ${body}`);
  }
}

export const telegramProvider: MessagingProvider = {
  async sendMessage(chatId: string, text: string) {
    await callTelegramApi("sendMessage", { chat_id: chatId, text });
  },

  async sendMarkdown(chatId: string, markdown: string) {
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: markdown,
      parse_mode: "Markdown",
    });
  },
};

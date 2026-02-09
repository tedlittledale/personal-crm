/**
 * Abstract messaging provider interface.
 * Currently implemented by Telegram; will be swapped for WhatsApp/Twilio later.
 */
export interface MessagingProvider {
  /** Send a plain-text message */
  sendMessage(chatId: string, text: string): Promise<void>;

  /** Send a message formatted as Markdown */
  sendMarkdown(chatId: string, markdown: string): Promise<void>;
}

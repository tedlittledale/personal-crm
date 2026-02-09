import type { MessagingProvider } from "./types";
import { telegramProvider } from "./telegram";

/**
 * Returns the active messaging provider.
 * Currently Telegram — swap this function body when migrating to
 * WhatsApp / Twilio.
 */
export function getMessagingProvider(): MessagingProvider {
  return telegramProvider;
}

export type { MessagingProvider } from "./types";

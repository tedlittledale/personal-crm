// Scheduled gift messages, built from a user's gift ideas. Pure (no database
// or messaging imports) so the date rules can be tested in isolation; the
// birthday-reminder cron fetches the data and sends what this returns.

import { isLive, type Birthday } from "@/lib/gift-occasions";

/** How far ahead of a birthday the gift nudge is sent. */
export const BIRTHDAY_NUDGE_DAYS = 14;
/** Day of the Christmas gift roundup, a month before. */
export const CHRISTMAS_ROUNDUP = { month: 11, day: 25 };
/** Day after Christmas we ask which gifts were given. */
export const CHRISTMAS_FOLLOW_UP = { month: 12, day: 27 };

export type NudgeGift = Birthday & {
  personId: string;
  personName: string;
  idea: string;
  status: string;
  occasionType: string;
  occasionYear: number;
  occasionLabel?: string | null;
};

type LocalDate = { year: number; month: number; day: number };

const MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The date a birthday falls on in a given year (29 Feb moves to 28 Feb in non-leap years). */
function birthdayIn(year: number, month: number, day: number): LocalDate {
  if (month === 2 && day === 29 && !isLeapYear(year)) return { year, month, day: 28 };
  return { year, month, day };
}

/** The calendar date `days` after (or before, if negative) `date`. */
function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function sameDay(a: LocalDate, b: LocalDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function isBirthdayOn(person: Birthday, date: LocalDate): boolean {
  if (person.birthdayMonth == null || person.birthdayDay == null) return false;
  return sameDay(birthdayIn(date.year, person.birthdayMonth, person.birthdayDay), date);
}

/** Group gifts by contact, keeping first-seen order. */
function byPerson(gifts: NudgeGift[]): NudgeGift[][] {
  const groups = new Map<string, NudgeGift[]>();
  for (const gift of gifts) {
    groups.set(gift.personId, [...(groups.get(gift.personId) ?? []), gift]);
  }
  return [...groups.values()];
}

function giftLine(gift: NudgeGift): string {
  return `  • ${gift.idea}${gift.status === "bought" ? " (bought)" : ""}`;
}

/**
 * The gift messages to send today, one string per Telegram message.
 *
 * `gifts` should be all the user's non-dropped gift ideas. Only contacts with
 * at least one gift idea (past or present) get nudges, so a CRM full of work
 * contacts doesn't turn into a present-buying list.
 */
export function buildGiftNudges(gifts: NudgeGift[], today: LocalDate): string[] {
  const messages: string[] = [];
  const people = byPerson(gifts);
  const liveFor = (group: NudgeGift[]) => group.filter((g) => isLive(g, g, today));

  // Birthday coming up: list everything still live for them.
  const nudgeDate = addDays(today, BIRTHDAY_NUDGE_DAYS);
  for (const group of people) {
    const person = group[0];
    if (!isBirthdayOn(person, nudgeDate)) continue;
    const live = liveFor(group);
    const lines = [
      `🎁 ${person.personName}'s birthday is in 2 weeks (${nudgeDate.day} ${MONTHS[nudgeDate.month]}).`,
    ];
    if (live.length) {
      lines.push("", "Gift ideas:", ...live.map(giftLine));
    } else {
      lines.push("", "No gift ideas saved yet.");
    }
    messages.push(lines.join("\n"));
  }

  // Christmas roundup: who's sorted, who has ideas, who has nothing.
  if (today.month === CHRISTMAS_ROUNDUP.month && today.day === CHRISTMAS_ROUNDUP.day) {
    const sorted: string[] = [];
    const ideas: string[] = [];
    const nothing: string[] = [];
    for (const group of people) {
      const live = liveFor(group);
      const boughtForChristmas = live.filter(
        (g) =>
          g.status === "bought" &&
          g.occasionType === "christmas" &&
          g.occasionYear === today.year
      );
      const unbought = live.filter((g) => g.status === "idea");
      const name = group[0].personName;
      if (boughtForChristmas.length) {
        sorted.push(`  • ${name}: ${boughtForChristmas.map((g) => g.idea).join(", ")}`);
      } else if (unbought.length) {
        ideas.push(`  • ${name}: ${unbought.map((g) => g.idea).join(", ")}`);
      } else {
        nothing.push(`  • ${name}`);
      }
    }
    if (people.length) {
      const lines = ["🎄 Christmas is a month away. Gift roundup:"];
      if (sorted.length) lines.push("", "Bought:", ...sorted);
      if (ideas.length) lines.push("", "Ideas, nothing bought yet:", ...ideas);
      if (nothing.length) lines.push("", "No ideas yet:", ...nothing);
      messages.push(lines.join("\n"));
    }
  }

  // Occasion just passed: ask what was given, so history stays accurate.
  const yesterday = addDays(today, -1);
  for (const group of people) {
    const person = group[0];
    if (!isBirthdayOn(person, yesterday)) continue;
    const filed = group.filter(
      (g) =>
        g.occasionType === "birthday" &&
        g.occasionYear === yesterday.year &&
        (g.status === "idea" || g.status === "bought")
    );
    if (!filed.length) continue;
    messages.push(
      [
        `🎂 ${person.personName}'s birthday was yesterday. Did you give any of these?`,
        "",
        ...filed.map(giftLine),
        "",
        `Reply e.g. "gave ${person.personName} the ${filed[0].idea}". Ideas you didn't use stay on the list.`,
      ].join("\n")
    );
  }

  if (today.month === CHRISTMAS_FOLLOW_UP.month && today.day === CHRISTMAS_FOLLOW_UP.day) {
    const filed = gifts.filter(
      (g) =>
        g.occasionType === "christmas" &&
        g.occasionYear === today.year &&
        (g.status === "idea" || g.status === "bought")
    );
    if (filed.length) {
      const lines = ["🎄 Hope Christmas went well! Which of these did you give?"];
      for (const group of byPerson(filed)) {
        lines.push("", `${group[0].personName}:`, ...group.map(giftLine));
      }
      lines.push(
        "",
        `Reply e.g. "gave ${filed[0].personName} the ${filed[0].idea}". Ideas you didn't use stay on the list.`
      );
      messages.push(lines.join("\n"));
    }
  }

  return messages;
}

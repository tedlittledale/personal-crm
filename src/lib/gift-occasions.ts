// Pure date logic for gift occasions. No database imports, so it can be used
// from client components and tested in isolation.

export type OccasionType = "birthday" | "christmas" | "other";

export type Occasion = {
  type: OccasionType;
  year: number;
  label?: string | null; // only for 'other'
};

export type Birthday = {
  birthdayMonth: number | null;
  birthdayDay: number | null;
};

/** A calendar date with no time or timezone attached. */
type LocalDate = { year: number; month: number; day: number };

/** Today's date in the given IANA timezone. */
export function localDate(now: Date, timezone: string): LocalDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function compare(a: LocalDate, b: LocalDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

function hasBirthday(b: Birthday): b is { birthdayMonth: number; birthdayDay: number } {
  return b.birthdayMonth != null && b.birthdayDay != null;
}

/**
 * The next time this month/day comes round, strictly after today. On the day
 * itself the occasion counts as passed: an idea logged on someone's birthday
 * is for the next one.
 */
function nextOn(month: number, day: number, today: LocalDate): LocalDate {
  const thisYear = { year: today.year, month, day };
  return compare(thisYear, today) > 0
    ? thisYear
    : { year: today.year + 1, month, day };
}

/** The year of the next birthday or Christmas after today. */
export function nextOccasionYear(
  type: "birthday" | "christmas",
  person: Birthday,
  today: LocalDate
): number {
  if (type === "christmas") return nextOn(12, 25, today).year;
  // No birthday on file: assume it is still to come this year.
  if (!hasBirthday(person)) return today.year;
  return nextOn(person.birthdayMonth, person.birthdayDay, today).year;
}

/**
 * The occasion a new gift idea is filed under when none is specified: the
 * person's next birthday or Christmas, whichever comes first. Without a
 * birthday on file it defaults to Christmas.
 */
export function defaultOccasion(person: Birthday, today: LocalDate): Occasion {
  const christmas = nextOn(12, 25, today);
  if (!hasBirthday(person)) return { type: "christmas", year: christmas.year };
  const birthday = nextOn(person.birthdayMonth, person.birthdayDay, today);
  return compare(birthday, christmas) <= 0
    ? { type: "birthday", year: birthday.year }
    : { type: "christmas", year: christmas.year };
}

/**
 * Resolve a possibly partial occasion (e.g. "his birthday" with no year) to a
 * full one, filling gaps with the next upcoming date.
 */
export function resolveOccasion(
  requested: { type?: OccasionType | null; year?: number | null; label?: string | null },
  person: Birthday,
  today: LocalDate
): Occasion {
  if (!requested.type) {
    const occasion = defaultOccasion(person, today);
    return requested.year ? { ...occasion, year: requested.year } : occasion;
  }
  if (requested.type === "other") {
    return {
      type: "other",
      year: requested.year ?? today.year,
      label: requested.label?.trim() || null,
    };
  }
  return {
    type: requested.type,
    year: requested.year ?? nextOccasionYear(requested.type, person, today),
  };
}

/**
 * Whether the occasion is over. Birthdays without a date on file and 'other'
 * occasions are treated as lasting until the end of their year.
 */
export function isOccasionPast(
  occasion: Occasion,
  person: Birthday,
  today: LocalDate
): boolean {
  let date: LocalDate;
  if (occasion.type === "christmas") {
    date = { year: occasion.year, month: 12, day: 25 };
  } else if (occasion.type === "birthday" && hasBirthday(person)) {
    date = { year: occasion.year, month: person.birthdayMonth, day: person.birthdayDay };
  } else {
    date = { year: occasion.year, month: 12, day: 31 };
  }
  return compare(date, today) < 0;
}

/** Human-readable occasion, e.g. "Christmas 2026" or "birthday 2027". */
export function formatOccasion(occasion: Occasion): string {
  if (occasion.type === "christmas") return `Christmas ${occasion.year}`;
  if (occasion.type === "birthday") return `birthday ${occasion.year}`;
  return `${occasion.label || "other"} ${occasion.year}`;
}

/** The occasion a stored gift idea is filed under. */
export function giftOccasion(gift: {
  occasionType: string;
  occasionYear: number;
  occasionLabel?: string | null;
}): Occasion {
  return {
    type: gift.occasionType as OccasionType,
    year: gift.occasionYear,
    label: gift.occasionLabel ?? null,
  };
}

export const GIFT_STATUSES = ["idea", "bought", "given", "dropped"] as const;
export type GiftStatus = (typeof GIFT_STATUSES)[number];

/**
 * Whether a gift belongs on the live list rather than in history. Ideas stay
 * live whatever year they were filed under, so nothing gets lost when an
 * occasion passes. Bought gifts are live until their occasion is over, then
 * assumed given. Given and dropped are never live.
 */
export function isLive(
  gift: { status: string; occasionType: string; occasionYear: number; occasionLabel?: string | null },
  person: Birthday,
  today: LocalDate
): boolean {
  if (gift.status === "idea") return true;
  if (gift.status === "bought") {
    return !isOccasionPast(giftOccasion(gift), person, today);
  }
  return false;
}

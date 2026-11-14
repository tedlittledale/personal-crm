// Groups gift ideas by the occasion they are for, for the /gifts overview.
// Pure logic with no database imports, so it can be tested in isolation.

import {
  formatOccasion,
  giftOccasion,
  isLive,
  nextOccasionYear,
  type LocalDate,
  type OccasionType,
} from "@/lib/gift-occasions";

export type ScheduleGift = {
  id: string;
  personId: string;
  personName: string;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  idea: string;
  notes: string | null;
  occasionType: string;
  occasionYear: number;
  occasionLabel: string | null;
  status: string;
};

/** A live gift, flagged when it was filed under an occasion that has passed. */
export type UpcomingGift<G extends ScheduleGift> = G & { carriedOverFrom: number | null };

export type PersonGifts<G> = { personId: string; personName: string; gifts: G[] };

export type OccasionGroup<G> = {
  key: string;
  type: OccasionType;
  title: string;
  /** Null when the day isn't known: 'other' occasions, or no birthday on file. */
  date: LocalDate | null;
  daysAway: number | null;
  people: PersonGifts<G>[];
};

function dayNumber(d: LocalDate): number {
  return Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;
}

function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/** Add a gift to its group, creating the group and person entry as needed. */
function addTo<G extends ScheduleGift, T extends G>(
  groups: Map<string, OccasionGroup<T>>,
  base: Omit<OccasionGroup<T>, "people">,
  gift: T
) {
  let group = groups.get(base.key);
  if (!group) {
    group = { ...base, people: [] };
    groups.set(base.key, group);
  }
  let person = group.people.find((p) => p.personId === gift.personId);
  if (!person) {
    person = { personId: gift.personId, personName: gift.personName, gifts: [] };
    group.people.push(person);
  }
  person.gifts.push(gift);
}

/**
 * Live gifts grouped by the occasion they'll be used for, soonest first.
 * Ideas filed under an occasion that has already passed are moved to the
 * same kind of occasion next time round (next Christmas, the person's next
 * birthday), so an unused idea is never hidden. 'Other' occasions have no
 * known day, so they keep their own year and come after the dated ones.
 */
export function upcomingGiftGroups<G extends ScheduleGift>(
  gifts: G[],
  today: LocalDate
): OccasionGroup<UpcomingGift<G>>[] {
  const groups = new Map<string, OccasionGroup<UpcomingGift<G>>>();
  const todayNum = dayNumber(today);

  for (const gift of gifts) {
    if (!isLive(gift, gift, today)) continue;

    if (gift.occasionType === "christmas") {
      const year = Math.max(gift.occasionYear, nextOccasionYear("christmas", gift, today));
      const date = { year, month: 12, day: 25 };
      addTo(
        groups,
        {
          key: `christmas|${year}`,
          type: "christmas",
          title: `Christmas ${year}`,
          date,
          daysAway: dayNumber(date) - todayNum,
        },
        { ...gift, carriedOverFrom: gift.occasionYear < year ? gift.occasionYear : null }
      );
    } else if (gift.occasionType === "birthday") {
      const title = `${possessive(gift.personName)} birthday`;
      if (gift.birthdayMonth == null || gift.birthdayDay == null) {
        addTo(
          groups,
          { key: `birthday|${gift.personId}|undated`, type: "birthday", title, date: null, daysAway: null },
          { ...gift, carriedOverFrom: null }
        );
        continue;
      }
      const year = Math.max(gift.occasionYear, nextOccasionYear("birthday", gift, today));
      const date = { year, month: gift.birthdayMonth, day: gift.birthdayDay };
      addTo(
        groups,
        {
          key: `birthday|${gift.personId}|${year}`,
          type: "birthday",
          title,
          date,
          daysAway: dayNumber(date) - todayNum,
        },
        { ...gift, carriedOverFrom: gift.occasionYear < year ? gift.occasionYear : null }
      );
    } else {
      const label = gift.occasionLabel?.trim() || "Other";
      addTo(
        groups,
        {
          key: `other|${label.toLowerCase()}|${gift.occasionYear}`,
          type: "other",
          title: `${label} ${gift.occasionYear}`,
          date: null,
          daysAway: null,
        },
        { ...gift, carriedOverFrom: null }
      );
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.date && b.date) return dayNumber(a.date) - dayNumber(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    // Undated: 'other' occasions by year, then birthdays with no date on file.
    if (a.type !== b.type) return a.type === "other" ? -1 : 1;
    const yearA = a.people[0].gifts[0].occasionYear;
    const yearB = b.people[0].gifts[0].occasionYear;
    return yearA - yearB || a.title.localeCompare(b.title);
  });
}

/**
 * Given gifts, and bought gifts whose occasion has passed, grouped by the
 * occasion they were filed under, most recent year first.
 */
export function giftHistoryGroups<G extends ScheduleGift>(
  gifts: G[],
  today: LocalDate
): OccasionGroup<G>[] {
  const groups = new Map<string, OccasionGroup<G>>();
  const ORDER: Record<string, number> = { christmas: 0, birthday: 1, other: 2 };

  for (const gift of gifts) {
    if (gift.status === "dropped" || isLive(gift, gift, today)) continue;
    const occasion = giftOccasion(gift);
    const isBirthday = occasion.type === "birthday";
    addTo(
      groups,
      {
        key: isBirthday
          ? `birthday|${gift.personId}|${occasion.year}`
          : `${formatOccasion(occasion).toLowerCase()}`,
        type: occasion.type,
        title: isBirthday
          ? `${possessive(gift.personName)} birthday ${occasion.year}`
          : formatOccasion(occasion),
        date: null,
        daysAway: null,
      },
      gift
    );
  }

  return [...groups.values()].sort((a, b) => {
    const ga = a.people[0].gifts[0];
    const gb = b.people[0].gifts[0];
    return (
      gb.occasionYear - ga.occasionYear ||
      ORDER[a.type] - ORDER[b.type] ||
      a.title.localeCompare(b.title)
    );
  });
}

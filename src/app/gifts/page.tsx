import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { getUserTimezone, listGiftIdeas, type GiftIdeaWithPerson } from "@/lib/gifts";
import {
  isLive,
  localDate,
  nextOccasionYear,
} from "@/lib/gift-occasions";

const MONTHS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Group gifts by contact, keeping the first-seen order. */
function byPerson(gifts: GiftIdeaWithPerson[]) {
  const groups = new Map<string, GiftIdeaWithPerson[]>();
  for (const gift of gifts) {
    groups.set(gift.personId, [...(groups.get(gift.personId) ?? []), gift]);
  }
  return [...groups.values()];
}

function PersonGifts({ gifts, suffix }: { gifts: GiftIdeaWithPerson[]; suffix?: string }) {
  const person = gifts[0];
  return (
    <li className="rounded-lg border border-border px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/person/${person.personId}`} className="text-sm font-medium hover:underline">
          {person.personName}
        </Link>
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
      <ul className="mt-1 space-y-0.5">
        {gifts.map((g) => (
          <li key={g.id} className="text-sm flex items-center gap-2">
            <span className={g.status === "given" ? "text-muted-foreground" : ""}>{g.idea}</span>
            {g.status !== "idea" && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{g.status}</span>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

export default async function GiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const timezone = await getUserTimezone(userId);
  const today = localDate(new Date(), timezone);
  const upcomingChristmas = nextOccasionYear(
    "christmas",
    { birthdayMonth: null, birthdayDay: null },
    today
  );
  const { year: yearParam } = await searchParams;
  const parsedYear = parseInt(yearParam ?? "", 10);
  const year = Number.isNaN(parsedYear) ? upcomingChristmas : parsedYear;

  const all = await listGiftIdeas(userId);
  const christmas = all.filter(
    (g) => g.occasionType === "christmas" && g.occasionYear === year
  );

  // Live birthday ideas, soonest birthday first.
  const birthdays = byPerson(
    all.filter((g) => g.occasionType === "birthday" && isLive(g, g, today))
  );
  const daysUntil = (g: GiftIdeaWithPerson) => {
    if (g.birthdayMonth == null || g.birthdayDay == null) return Infinity;
    const start = Date.UTC(today.year, today.month - 1, today.day);
    let next = Date.UTC(today.year, g.birthdayMonth - 1, g.birthdayDay);
    if (next <= start) next = Date.UTC(today.year + 1, g.birthdayMonth - 1, g.birthdayDay);
    return (next - start) / 86_400_000;
  };
  birthdays.sort((a, b) => daysUntil(a[0]) - daysUntil(b[0]));

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Gifts</h1>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Christmas {year}</h2>
          <div className="flex gap-2 text-sm">
            <Link href={`/gifts?year=${year - 1}`} className="text-muted-foreground hover:text-foreground">
              ← {year - 1}
            </Link>
            {year !== upcomingChristmas && (
              <Link href="/gifts" className="text-muted-foreground hover:text-foreground">
                This Christmas
              </Link>
            )}
            <Link href={`/gifts?year=${year + 1}`} className="text-muted-foreground hover:text-foreground">
              {year + 1} →
            </Link>
          </div>
        </div>
        {christmas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No gift ideas for Christmas {year}.</p>
        ) : (
          <ul className="space-y-2">
            {byPerson(christmas).map((gifts) => (
              <PersonGifts key={gifts[0].personId} gifts={gifts} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Birthdays</h2>
        {birthdays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No birthday gift ideas.</p>
        ) : (
          <ul className="space-y-2">
            {birthdays.map((gifts) => {
              const p = gifts[0];
              const when =
                p.birthdayMonth != null && p.birthdayDay != null
                  ? `${p.birthdayDay} ${MONTHS[p.birthdayMonth]}`
                  : "birthday not set";
              return <PersonGifts key={p.personId} gifts={gifts} suffix={when} />;
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

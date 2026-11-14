import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { getUserTimezone, listGiftIdeas } from "@/lib/gifts";
import { localDate, type LocalDate } from "@/lib/gift-occasions";
import {
  giftHistoryGroups,
  upcomingGiftGroups,
  type OccasionGroup,
  type ScheduleGift,
  type UpcomingGift,
} from "@/lib/gift-schedule";

const MONTHS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatWhen(date: LocalDate | null, daysAway: number | null, type: string): string {
  if (!date || daysAway == null) {
    return type === "birthday" ? "Birthday not set" : "Date not set";
  }
  const day = `${date.day} ${MONTHS[date.month]}`;
  if (daysAway === 1) return `${day} · tomorrow`;
  if (daysAway < 14) return `${day} · in ${daysAway} days`;
  if (daysAway < 60) return `${day} · in ${Math.round(daysAway / 7)} weeks`;
  return `${day} ${date.year} · in ${Math.round(daysAway / 30.44)} months`;
}

function Notes({ notes }: { notes: string }) {
  if (/^https?:\/\/\S+$/.test(notes.trim())) {
    return (
      <a
        href={notes.trim()}
        target="_blank"
        rel="noopener noreferrer"
        className="block truncate text-xs text-muted-foreground underline hover:text-foreground"
      >
        {notes.trim()}
      </a>
    );
  }
  return <p className="text-xs text-muted-foreground">{notes}</p>;
}

function GiftRow({ gift, muted }: { gift: ScheduleGift & { carriedOverFrom?: number | null }; muted?: boolean }) {
  return (
    <li className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={muted ? "text-muted-foreground" : ""}>{gift.idea}</span>
        {gift.status !== "idea" && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{gift.status}</span>
        )}
        {gift.carriedOverFrom != null && (
          <span className="text-xs text-muted-foreground">from {gift.carriedOverFrom}</span>
        )}
      </div>
      {gift.notes && <Notes notes={gift.notes} />}
    </li>
  );
}

function OccasionCard<G extends ScheduleGift>({
  group,
  subtitle,
  muted,
}: {
  group: OccasionGroup<G>;
  subtitle?: string;
  muted?: boolean;
}) {
  // A birthday is one person's occasion, so link the title to them instead of
  // repeating their name above the list.
  const single = group.type === "birthday" ? group.people[0] : null;
  return (
    <li className="rounded-lg border border-border px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        {single ? (
          <Link href={`/person/${single.personId}`} className="text-sm font-medium hover:underline">
            {group.title}
          </Link>
        ) : (
          <h3 className="text-sm font-medium">{group.title}</h3>
        )}
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {single ? (
        <ul className="mt-1 space-y-1">
          {single.gifts.map((g) => (
            <GiftRow key={g.id} gift={g} muted={muted} />
          ))}
        </ul>
      ) : (
        <ul className="mt-2 space-y-2">
          {group.people.map((p) => (
            <li key={p.personId}>
              <Link
                href={`/person/${p.personId}`}
                className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                {p.personName}
              </Link>
              <ul className="space-y-1">
                {p.gifts.map((g) => (
                  <GiftRow key={g.id} gift={g} muted={muted} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default async function GiftsPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [timezone, all] = await Promise.all([getUserTimezone(userId), listGiftIdeas(userId)]);
  const today = localDate(new Date(), timezone);

  const upcoming = upcomingGiftGroups(all, today);
  const history = giftHistoryGroups(all, today);
  const ideaCount = upcoming.reduce(
    (n, g) => n + g.people.reduce((m, p) => m + p.gifts.length, 0),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Gifts</h1>
        {ideaCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {ideaCount} {ideaCount === 1 ? "idea" : "ideas"} across {upcoming.length}{" "}
            {upcoming.length === 1 ? "occasion" : "occasions"}
          </p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Coming up</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No gift ideas yet. Add them from a contact&apos;s page or by messaging the Telegram bot.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((group) => (
              <OccasionCard<UpcomingGift<ScheduleGift>>
                key={group.key}
                group={group}
                subtitle={formatWhen(group.date, group.daysAway, group.type)}
              />
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <details className="group space-y-3">
          <summary className="cursor-pointer text-base font-semibold list-none">
            <span className="group-open:hidden">▸</span>
            <span className="hidden group-open:inline">▾</span> Past gifts
          </summary>
          <ul className="mt-3 space-y-2">
            {history.map((group) => (
              <OccasionCard key={group.key} group={group} muted />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

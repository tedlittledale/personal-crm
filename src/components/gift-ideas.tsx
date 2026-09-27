"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  formatOccasion,
  giftOccasion,
  isLive,
  isOccasionPast,
  type GiftStatus,
} from "@/lib/gift-occasions";

export type GiftIdeaItem = {
  id: string;
  idea: string;
  notes: string | null;
  occasionType: string;
  occasionYear: number;
  occasionLabel: string | null;
  status: string;
};

type Person = {
  id: string;
  birthdayMonth: number | null;
  birthdayDay: number | null;
};

type Today = { year: number; month: number; day: number };

const OCCASION_ORDER: Record<string, number> = { birthday: 0, christmas: 1, other: 2 };

/** Group gifts by occasion, keyed by its display label, in date order. */
function groupByOccasion(gifts: GiftIdeaItem[], newestFirst: boolean) {
  const sorted = [...gifts].sort(
    (a, b) =>
      (newestFirst ? -1 : 1) *
      (a.occasionYear - b.occasionYear ||
        OCCASION_ORDER[a.occasionType] - OCCASION_ORDER[b.occasionType])
  );
  const groups = new Map<string, GiftIdeaItem[]>();
  for (const gift of sorted) {
    const label = formatOccasion(giftOccasion(gift));
    groups.set(label, [...(groups.get(label) ?? []), gift]);
  }
  return [...groups.entries()];
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20";
const smallButtonClass =
  "rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50";

export function GiftIdeas({
  person,
  gifts,
  today,
}: {
  person: Person;
  gifts: GiftIdeaItem[];
  today: Today;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idea, setIdea] = useState("");
  const [notes, setNotes] = useState("");
  const [occasion, setOccasion] = useState("");

  const live = gifts.filter((g) => isLive(g, person, today));
  const history = gifts.filter((g) => g.status !== "dropped" && !isLive(g, person, today));

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong");
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!idea.trim()) return;
    const ok = await send("/api/gifts", "POST", {
      personId: person.id,
      idea,
      notes: notes || null,
      occasionType: occasion || null,
    });
    if (ok) {
      setIdea("");
      setNotes("");
    }
  }

  function setStatus(id: string, status: GiftStatus) {
    return send(`/api/gifts/${id}`, "PATCH", { status });
  }

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <h2 className="text-base font-semibold">Gift ideas</h2>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
        <input
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Gift idea, e.g. microscope"
          className={`${inputClass} flex-1`}
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes or link (optional)"
          className={`${inputClass} sm:w-48`}
        />
        <select
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
          className={inputClass}
          aria-label="Occasion"
        >
          <option value="">Next occasion</option>
          <option value="birthday">Birthday</option>
          <option value="christmas">Christmas</option>
        </select>
        <button
          type="submit"
          disabled={busy || !idea.trim()}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {live.length === 0 ? (
        <p className="text-sm text-muted-foreground">No gift ideas yet.</p>
      ) : (
        <div className="space-y-4">
          {groupByOccasion(live, false).map(([label, items]) => {
            const past = isOccasionPast(giftOccasion(items[0]), person, today);
            return (
              <div key={label} className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {capitalise(label)}
                  {past && " (passed, still to use)"}
                </h3>
                <ul className="space-y-2">
                  {items.map((gift) => (
                    <li
                      key={gift.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="text-sm">{gift.idea}</span>
                        {gift.status === "bought" && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                            bought
                          </span>
                        )}
                        {gift.notes && (
                          <p className="text-xs text-muted-foreground break-words">
                            {gift.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {gift.status === "idea" && (
                          <button
                            disabled={busy}
                            onClick={() => setStatus(gift.id, "bought")}
                            className={smallButtonClass}
                          >
                            Bought
                          </button>
                        )}
                        <button
                          disabled={busy}
                          onClick={() => setStatus(gift.id, "given")}
                          className={smallButtonClass}
                        >
                          Given
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => setStatus(gift.id, "dropped")}
                          className={smallButtonClass}
                        >
                          Drop
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Previous years ({history.length})
          </summary>
          <div className="mt-3 space-y-3">
            {groupByOccasion(history, true).map(([label, items]) => (
              <div key={label}>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {capitalise(label)}
                </h3>
                <ul className="mt-1 space-y-1">
                  {items.map((gift) => (
                    <li key={gift.id} className="flex items-center justify-between gap-2">
                      <span>{gift.idea}</span>
                      <button
                        disabled={busy}
                        onClick={() => setStatus(gift.id, "idea")}
                        className={smallButtonClass}
                        title="Put back on the live list"
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { people } from "@/db/schema";
import { eq, and, ilike, desc } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";
import { SearchInput } from "@/components/search-input";
import { PeopleList } from "@/components/people-list";
import Link from "next/link";
import { Suspense } from "react";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) return null;

  await ensureUser(userId);

  const { search } = await searchParams;

  const conditions = [eq(people.userId, userId)];
  if (search) {
    conditions.push(ilike(people.name, `%${search}%`));
  }

  const results = await db
    .select()
    .from(people)
    .where(and(...conditions))
    .orderBy(desc(people.updatedAt));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">People</h1>
        <Link
          href="/person/new"
          className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          + Add person
        </Link>
      </div>
      <Suspense>
        <SearchInput />
      </Suspense>
      <PeopleList people={results} />
    </div>
  );
}

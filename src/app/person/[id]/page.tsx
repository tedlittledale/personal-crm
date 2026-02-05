import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { people } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PersonForm } from "@/components/person-form";
import Link from "next/link";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const { id } = await params;

  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, userId)));

  if (!person) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          People
        </Link>
        <span>/</span>
        <span className="text-foreground">{person.name}</span>
      </div>
      <h1 className="text-lg font-semibold">Edit person</h1>
      <PersonForm initialData={person} mode="edit" />
    </div>
  );
}

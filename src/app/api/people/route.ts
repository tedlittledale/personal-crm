import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { people } from "@/db/schema";
import { eq, and, ilike, desc } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";

// GET /api/people - List all people for the logged-in user, with optional search
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUser(userId);

  const search = req.nextUrl.searchParams.get("search");

  const conditions = [eq(people.userId, userId)];
  if (search) {
    conditions.push(ilike(people.name, `%${search}%`));
  }

  const results = await db
    .select()
    .from(people)
    .where(and(...conditions))
    .orderBy(desc(people.updatedAt));

  return NextResponse.json(results);
}

// POST /api/people - Create a new person
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUser(userId);

  const body = await req.json();
  const { name, company, role, personalDetails, notes, source, birthday, children } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const [person] = await db
      .insert(people)
      .values({
        userId,
        name: name.trim(),
        company: company?.trim() || null,
        role: role?.trim() || null,
        personalDetails: personalDetails?.trim() || null,
        notes: notes?.trim() || null,
        source: source?.trim() || null,
        birthday: birthday?.trim() || null,
        children: children?.trim() || null,
      })
      .returning();

    return NextResponse.json(person, { status: 201 });
  } catch (err) {
    console.error("Failed to create person:", err);
    return NextResponse.json(
      { error: "Failed to create person" },
      { status: 500 }
    );
  }
}

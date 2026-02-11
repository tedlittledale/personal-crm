import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { people } from "@/db/schema";
import { eq, and, ilike, desc } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";
import { generateContactSummary } from "@/lib/generate-summary";

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
  const { name, company, role, email, phone, personalDetails, notes, source, birthdayMonth, birthdayDay, children } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const contactData = {
      userId,
      name: name.trim(),
      company: company?.trim() || null,
      role: role?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      personalDetails: personalDetails?.trim() || null,
      notes: notes?.trim() || null,
      source: source?.trim() || null,
      birthdayMonth: birthdayMonth ?? null,
      birthdayDay: birthdayDay ?? null,
      children: children?.trim() || null,
    };

    const [person] = await db
      .insert(people)
      .values(contactData)
      .returning();

    // Generate AI summary in the background — don't block the response
    generateContactSummary(contactData)
      .then((aiSummary) =>
        db
          .update(people)
          .set({ aiSummary })
          .where(eq(people.id, person.id))
      )
      .catch((err) => console.error("Failed to generate summary:", err));

    return NextResponse.json(person, { status: 201 });
  } catch (err) {
    console.error("Failed to create person:", err);
    return NextResponse.json(
      { error: "Failed to create person" },
      { status: 500 }
    );
  }
}

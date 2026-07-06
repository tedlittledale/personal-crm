import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { people } from "@/db/schema";
import { eq, and, ilike, desc } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";
import { createContact } from "@/lib/contacts";

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

  const body = await req.json();
  const { name, company, role, email, phone, address, personalDetails, notes, source, birthdayMonth, birthdayDay, children } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const person = await createContact(userId, {
      name,
      company,
      role,
      email,
      phone,
      address,
      personalDetails,
      notes,
      source,
      birthdayMonth,
      birthdayDay,
      children,
    });

    return NextResponse.json(person, { status: 201 });
  } catch (err) {
    console.error("Failed to create person:", err);
    return NextResponse.json(
      { error: "Failed to create person" },
      { status: 500 }
    );
  }
}

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { people } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// GET /api/people/[id] - Get a single person (must belong to user)
export async function GET(_req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, userId)));

  if (!person) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(person);
}

// PUT /api/people/[id] - Update a person (must belong to user)
export async function PUT(req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, company, role, email, phone, personalDetails, notes, source, birthdayMonth, birthdayDay, children } = body;

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  // Verify ownership first
  const [existing] = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, userId)));

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(people)
    .set({
      ...(name !== undefined && { name: name.trim() }),
      ...(company !== undefined && { company: company?.trim() || null }),
      ...(role !== undefined && { role: role?.trim() || null }),
      ...(email !== undefined && { email: email?.trim() || null }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(personalDetails !== undefined && { personalDetails: personalDetails?.trim() || null }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(source !== undefined && { source: source?.trim() || null }),
      ...(birthdayMonth !== undefined && { birthdayMonth: birthdayMonth ?? null }),
      ...(birthdayDay !== undefined && { birthdayDay: birthdayDay ?? null }),
      ...(children !== undefined && { children: children?.trim() || null }),
      updatedAt: new Date(),
    })
    .where(eq(people.id, id))
    .returning();

  return NextResponse.json(updated);
}

// DELETE /api/people/[id] - Delete a person (must belong to user)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [deleted] = await db
    .delete(people)
    .where(and(eq(people.id, id), eq(people.userId, userId)))
    .returning({ id: people.id });

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

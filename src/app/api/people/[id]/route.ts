import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  getContactById,
  updateContact,
  deleteContact,
} from "@/lib/contacts";

type Params = { params: Promise<{ id: string }> };

// GET /api/people/[id] - Get a single person (must belong to user)
export async function GET(_req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const person = await getContactById(userId, id);
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
  const { name, company, role, email, phone, address, personalDetails, notes, source, birthdayMonth, birthdayDay, children } = body;

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  const result = await updateContact(userId, id, {
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

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result.updated);
}

// DELETE /api/people/[id] - Delete a person (must belong to user)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const deleted = await deleteContact(userId, id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

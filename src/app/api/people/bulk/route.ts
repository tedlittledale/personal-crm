import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { people } from "@/db/schema";
import { ensureUser } from "@/lib/ensure-user";

/**
 * POST /api/people/bulk - Create multiple people in a single transaction
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUser(userId);

  try {
    const body = await req.json();
    const { contacts } = body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { error: "contacts must be a non-empty array" },
        { status: 400 }
      );
    }

    // Validate that every contact has a name
    const invalid = contacts.filter(
      (c: { name?: string }) =>
        !c.name || typeof c.name !== "string" || c.name.trim().length === 0
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `${invalid.length} contact(s) are missing a name` },
        { status: 400 }
      );
    }

    const values = contacts.map(
      (c: {
        name: string;
        company?: string | null;
        role?: string | null;
        personalDetails?: string | null;
        notes?: string | null;
        source?: string | null;
      }) => ({
        userId,
        name: c.name.trim(),
        company: c.company?.trim() || null,
        role: c.role?.trim() || null,
        personalDetails: c.personalDetails?.trim() || null,
        notes: c.notes?.trim() || null,
        source: c.source?.trim() || null,
      })
    );

    const created = await db.insert(people).values(values).returning();

    return NextResponse.json(
      { created: created.length, people: created },
      { status: 201 }
    );
  } catch (err) {
    console.error("Failed to bulk create people:", err);
    return NextResponse.json(
      { error: "Failed to create contacts" },
      { status: 500 }
    );
  }
}

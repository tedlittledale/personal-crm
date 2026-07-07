import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createContactsBulk, type ContactInput } from "@/lib/contacts";

/**
 * POST /api/people/bulk - Create multiple people in a single transaction
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const created = await createContactsBulk(userId, contacts as ContactInput[]);

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

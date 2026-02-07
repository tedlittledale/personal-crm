import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { people } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ensureUser } from "@/lib/ensure-user";

/**
 * Escape a value for CSV output.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 */
function csvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * GET /api/export - Export all contacts as a CSV file
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUser(userId);

  const results = await db
    .select()
    .from(people)
    .where(eq(people.userId, userId))
    .orderBy(desc(people.updatedAt));

  // Build CSV
  const headers = [
    "Name",
    "Company",
    "Role",
    "Email",
    "Phone",
    "Personal Details",
    "Notes",
    "Source",
    "Birthday Month",
    "Birthday Day",
    "Children",
    "Created",
    "Updated",
  ];

  const MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const rows = results.map((person) => [
    csvEscape(person.name),
    csvEscape(person.company),
    csvEscape(person.role),
    csvEscape(person.email),
    csvEscape(person.phone),
    csvEscape(person.personalDetails),
    csvEscape(person.notes),
    csvEscape(person.source),
    csvEscape(person.birthdayMonth ? MONTH_NAMES[person.birthdayMonth] : null),
    csvEscape(person.birthdayDay?.toString() ?? null),
    csvEscape(person.children),
    csvEscape(
      person.createdAt instanceof Date
        ? person.createdAt.toISOString()
        : String(person.createdAt)
    ),
    csvEscape(
      person.updatedAt instanceof Date
        ? person.updatedAt.toISOString()
        : String(person.updatedAt)
    ),
  ]);

  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
    "\n"
  );

  const today = new Date().toISOString().split("T")[0];

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${today}.csv"`,
    },
  });
}

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { ensureUser } from "@/lib/ensure-user";
import { executeNaturalLanguageQuery } from "@/lib/nl-query";

/**
 * GET /api/search?q=<natural language query>
 * Uses Claude to convert the query into database filters, then returns matching contacts.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUser(userId);

  const query = req.nextUrl.searchParams.get("q");
  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  try {
    const { results, summary } = await executeNaturalLanguageQuery(
      userId,
      query.trim()
    );

    return NextResponse.json({ results, summary });
  } catch (err) {
    console.error("Natural language search failed:", err);
    return NextResponse.json(
      { error: "Search failed. Please try rephrasing your question." },
      { status: 500 }
    );
  }
}

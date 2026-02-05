import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, pendingReviews } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractPersonFromTranscript } from "@/lib/extract";

// POST /api/ingest - Receive transcript via API key, extract data, create pending review
export async function POST(req: NextRequest) {
  // Authenticate via API key
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing x-api-key header" },
      { status: 401 }
    );
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.apiKey, apiKey));

  if (!user) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  // Parse request body
  const body = await req.json().catch(() => null);
  if (!body?.transcript || typeof body.transcript !== "string") {
    return NextResponse.json(
      { error: "Request body must include a 'transcript' string" },
      { status: 400 }
    );
  }

  const transcript = body.transcript.trim();
  if (transcript.length === 0) {
    return NextResponse.json(
      { error: "Transcript cannot be empty" },
      { status: 400 }
    );
  }

  try {
    // Extract structured data from transcript using Claude
    const extractedData = await extractPersonFromTranscript(transcript);

    // Create pending review with 7-day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [review] = await db
      .insert(pendingReviews)
      .values({
        userId: user.id,
        transcript,
        extractedData,
        expiresAt,
      })
      .returning();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const reviewUrl = `${baseUrl}/review/${review.id}`;

    return NextResponse.json({
      success: true,
      reviewUrl,
      extractedData,
    });
  } catch (err) {
    console.error("Ingest error:", err);
    return NextResponse.json(
      { error: "Failed to process transcript" },
      { status: 500 }
    );
  }
}

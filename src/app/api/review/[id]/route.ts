import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pendingReviews } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/review/[id] - Delete a pending review after it's been confirmed
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  await db
    .delete(pendingReviews)
    .where(
      and(eq(pendingReviews.id, id), eq(pendingReviews.userId, userId))
    );

  return NextResponse.json({ success: true });
}

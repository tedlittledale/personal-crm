import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { pendingReviews } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ReviewForm } from "./review-form";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const { id } = await params;

  const [review] = await db
    .select()
    .from(pendingReviews)
    .where(and(eq(pendingReviews.id, id), eq(pendingReviews.userId, userId)));

  if (!review) {
    notFound();
  }

  // Check if expired
  if (new Date(review.expiresAt) < new Date()) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Review expired</h1>
        <p className="text-sm text-muted-foreground">
          This review has expired. Please record a new voice note.
        </p>
      </div>
    );
  }

  const extracted = (review.extractedData as Record<string, string | null>) || {};

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Review extracted data</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Check the information below and correct any mistakes before saving.
        </p>
      </div>

      {/* Show original transcript collapsed */}
      <details className="rounded-lg border border-border">
        <summary className="px-4 py-2 text-sm font-medium cursor-pointer hover:bg-muted transition-colors">
          View original transcript
        </summary>
        <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground whitespace-pre-wrap">
          {review.transcript}
        </div>
      </details>

      <ReviewForm
        reviewId={review.id}
        initialData={{
          name: extracted.name || "",
          company: extracted.company || null,
          role: extracted.role || null,
          personalDetails: extracted.personalDetails || extracted.personal_details || null,
          notes: extracted.notes || null,
          source: extracted.source || null,
        }}
      />
    </div>
  );
}

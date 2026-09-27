import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteGiftIdeas, updateGiftIdea } from "@/lib/gifts";
import { GIFT_STATUSES } from "@/lib/gift-occasions";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  idea: z.string().trim().min(1).optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(GIFT_STATUSES).optional(),
  occasionType: z.enum(["birthday", "christmas", "other"]).optional(),
  occasionYear: z.number().int().min(2000).max(2100).optional(),
  occasionLabel: z.string().nullable().optional(),
});

// PATCH /api/gifts/[id] - Update a gift idea (status, occasion, wording)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  const { id } = await params;
  const gift = await updateGiftIdea(userId, id, parsed.data);
  if (!gift) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(gift);
}

// DELETE /api/gifts/[id] - Delete a gift idea
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteGiftIdeas(userId, [id]);
  if (deleted === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addGiftIdeas, getUserTimezone, listGiftIdeas } from "@/lib/gifts";

const occasionTypeSchema = z.enum(["birthday", "christmas", "other"]);

const createSchema = z.object({
  personId: z.uuid(),
  idea: z.string().trim().min(1),
  notes: z.string().nullish(),
  occasionType: occasionTypeSchema.nullish(),
  occasionYear: z.number().int().min(2000).max(2100).nullish(),
  occasionLabel: z.string().nullish(),
});

// GET /api/gifts?personId=&occasionType=&year= - List the user's gift ideas
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const occasionType = occasionTypeSchema.safeParse(params.get("occasionType"));
  const year = parseInt(params.get("year") ?? "", 10);

  const gifts = await listGiftIdeas(userId, {
    personId: params.get("personId") ?? undefined,
    occasionType: occasionType.success ? occasionType.data : undefined,
    year: Number.isNaN(year) ? undefined : year,
  });
  return NextResponse.json(gifts);
}

// POST /api/gifts - Add a gift idea for a contact
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid gift idea" }, { status: 400 });
  }
  const { personId, idea, notes, occasionType, occasionYear, occasionLabel } =
    parsed.data;

  const saved = await addGiftIdeas(
    userId,
    personId,
    [{ idea, notes }],
    { type: occasionType, year: occasionYear, label: occasionLabel },
    await getUserTimezone(userId)
  );
  if (!saved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(saved.gifts[0], { status: 201 });
}

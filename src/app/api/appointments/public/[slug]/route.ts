import { NextRequest, NextResponse } from "next/server";
import { getPublicScheduleBySlug } from "@/lib/appointments/settings-store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  const found = await getPublicScheduleBySlug(slug);
  if (!found || !found.meta.enabled) {
    return NextResponse.json({ error: "Booking page not found or disabled" }, { status: 404 });
  }
  return NextResponse.json({ schedule: found.meta });
}

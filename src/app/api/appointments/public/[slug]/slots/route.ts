import { NextRequest, NextResponse } from "next/server";
import { getPublicScheduleBySlug } from "@/lib/appointments/settings-store";
import { getValidAccessToken, queryFreeBusy } from "@/lib/appointments/google-calendar";
import {
  addDaysYmd,
  computeBookableSlots,
  formatYmdInTimeZone,
  zonedWallTimeToUtc,
} from "@/lib/appointments/slots";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  const date = (request.nextUrl.searchParams.get("date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date=YYYY-MM-DD is required" }, { status: 400 });
  }

  const found = await getPublicScheduleBySlug(slug);
  if (!found || !found.meta.enabled) {
    return NextResponse.json({ error: "Booking page not found or disabled" }, { status: 404 });
  }

  const { schedule, connection } = found.settings;
  if (!connection?.calendarId) {
    return NextResponse.json({ error: "Calendar not configured" }, { status: 503 });
  }

  const todayYmd = formatYmdInTimeZone(new Date(), schedule.timezone);
  const maxYmd = addDaysYmd(todayYmd, schedule.maxDaysAhead);
  if (date < todayYmd || date > maxYmd) {
    return NextResponse.json({ slots: [], timezone: schedule.timezone });
  }

  try {
    const { accessToken } = await getValidAccessToken(connection);
    const [y, m, d] = date.split("-").map(Number);
    const dayStart = zonedWallTimeToUtc(y!, m!, d!, 0, 0, schedule.timezone);
    const dayEnd = zonedWallTimeToUtc(y!, m!, d!, 23, 59, schedule.timezone);
    const busy = await queryFreeBusy({
      accessToken,
      calendarId: connection.calendarId,
      timeMinIso: dayStart.toISOString(),
      timeMaxIso: dayEnd.toISOString(),
    });
    const slots = computeBookableSlots({
      schedule,
      dateYmd: date,
      busy,
    });
    return NextResponse.json({
      date,
      timezone: schedule.timezone,
      durationMinutes: schedule.durationMinutes,
      slots,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load slots" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import {
  getValidAccessToken,
  listCalendarEvents,
} from "@/lib/appointments/google-calendar";
import { getAppointmentSettings } from "@/lib/appointments/settings-store";

export const dynamic = "force-dynamic";

/**
 * List events on the selected company calendar for the admin calendar view.
 * Query: timeMin, timeMax (ISO), optional timezone
 */
export async function GET(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const timeMin = request.nextUrl.searchParams.get("timeMin")?.trim() || "";
  const timeMax = request.nextUrl.searchParams.get("timeMax")?.trim() || "";
  const timezone = request.nextUrl.searchParams.get("timezone")?.trim() || undefined;

  if (!timeMin || !timeMax) {
    return NextResponse.json(
      { error: "timeMin and timeMax are required (ISO datetimes)" },
      { status: 400 }
    );
  }

  const minMs = Date.parse(timeMin);
  const maxMs = Date.parse(timeMax);
  if (Number.isNaN(minMs) || Number.isNaN(maxMs) || maxMs <= minMs) {
    return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
  }
  // Cap range to ~62 days to keep Google responses reasonable
  if (maxMs - minMs > 62 * 24 * 3600_000) {
    return NextResponse.json(
      { error: "Time range too large (max 62 days)" },
      { status: 400 }
    );
  }

  try {
    const settings = await getAppointmentSettings();
    const { accessToken, connection } = await getValidAccessToken(settings.connection);
    if (!connection.calendarId) {
      return NextResponse.json(
        { error: "No calendar selected. Choose a calendar first." },
        { status: 400 }
      );
    }

    const events = await listCalendarEvents({
      accessToken,
      calendarId: connection.calendarId,
      timeMinIso: new Date(minMs).toISOString(),
      timeMaxIso: new Date(maxMs).toISOString(),
      timezone: timezone || settings.schedule?.timezone,
    });

    return NextResponse.json({
      calendarId: connection.calendarId,
      calendarSummary: connection.calendarSummary || null,
      timezone: timezone || settings.schedule?.timezone || "America/New_York",
      events,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load events" },
      { status: 400 }
    );
  }
}

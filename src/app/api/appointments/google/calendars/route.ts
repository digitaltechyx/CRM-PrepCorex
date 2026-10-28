import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import {
  createNamedCalendar,
  getValidAccessToken,
  listWritableCalendars,
} from "@/lib/appointments/google-calendar";
import {
  getAppointmentSettings,
  saveAppointmentConnection,
} from "@/lib/appointments/settings-store";

export const dynamic = "force-dynamic";

/** List calendars the connected Google account can write to. */
export async function GET(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const { accessToken, connection } = await getValidAccessToken();
    const calendars = await listWritableCalendars(accessToken);
    return NextResponse.json({
      calendars,
      selectedCalendarId: connection.calendarId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not list calendars" },
      { status: 400 }
    );
  }
}

/**
 * Select an existing calendar, or create a new one for appointments.
 * Body: { calendarId: string } OR { create: true, summary?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      calendarId?: string;
      create?: boolean;
      summary?: string;
    };
    const { accessToken, connection } = await getValidAccessToken();
    const settings = await getAppointmentSettings();

    if (body.create) {
      const created = await createNamedCalendar(
        accessToken,
        body.summary?.trim() || "PrepCorex Appointments"
      );
      if (!created.id) throw new Error("Google did not return a calendar id");
      await saveAppointmentConnection({
        ...connection,
        calendarId: created.id,
        calendarSummary: created.summary,
        calendarCreatedByUs: true,
        connectedByUid: auth.uid,
      });
      return NextResponse.json({
        calendarId: created.id,
        calendarSummary: created.summary,
        created: true,
      });
    }

    const calendarId = String(body.calendarId || "").trim();
    if (!calendarId) {
      return NextResponse.json(
        { error: "calendarId or create:true is required" },
        { status: 400 }
      );
    }

    const list = await listWritableCalendars(accessToken);
    const match = list.find((c) => c.id === calendarId);
    if (!match) {
      return NextResponse.json(
        { error: "Calendar not found or not writable" },
        { status: 404 }
      );
    }

    await saveAppointmentConnection({
      ...connection,
      ...settings.connection,
      calendarId: match.id,
      calendarSummary: match.summary,
      calendarCreatedByUs: false,
      connectedByUid: auth.uid,
    });

    return NextResponse.json({
      calendarId: match.id,
      calendarSummary: match.summary,
      created: false,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Calendar update failed" },
      { status: 400 }
    );
  }
}

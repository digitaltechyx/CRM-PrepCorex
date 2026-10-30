import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { getPublicScheduleBySlug } from "@/lib/appointments/settings-store";
import {
  createAppointmentEvent,
  getValidAccessToken,
  queryFreeBusy,
} from "@/lib/appointments/google-calendar";
import { computeBookableSlots, formatYmdInTimeZone } from "@/lib/appointments/slots";
import { CRM_APPOINTMENTS_COLLECTION } from "@/lib/appointments/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

function clean(v: unknown, max: number) {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  const found = await getPublicScheduleBySlug(slug);
  if (!found || !found.meta.enabled) {
    return NextResponse.json({ error: "Booking page not found or disabled" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = clean(body.name, 120);
  const email = clean(body.email, 160).toLowerCase();
  const phone = clean(body.phone, 40);
  const notes = clean(body.notes, 2000);
  const startIso = clean(body.startIso, 40);

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!startIso) return NextResponse.json({ error: "startIso is required" }, { status: 400 });

  const { schedule, connection } = found.settings;
  if (!connection?.calendarId) {
    return NextResponse.json({ error: "Calendar not configured" }, { status: 503 });
  }

  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
  }
  const dateYmd = formatYmdInTimeZone(start, schedule.timezone);

  try {
    const { accessToken } = await getValidAccessToken(connection);
    const dayStart = new Date(start);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(start);
    dayEnd.setUTCHours(23, 59, 59, 999);

    // Re-check availability (race-safe enough for v1)
    const busy = await queryFreeBusy({
      accessToken,
      calendarId: connection.calendarId,
      timeMinIso: new Date(start.getTime() - 24 * 3600_000).toISOString(),
      timeMaxIso: new Date(start.getTime() + 24 * 3600_000).toISOString(),
    });
    const slots = computeBookableSlots({ schedule, dateYmd, busy });
    const match = slots.find((s) => s.startIso === startIso);
    if (!match) {
      return NextResponse.json(
        { error: "That time is no longer available. Please pick another slot." },
        { status: 409 }
      );
    }

    const descriptionParts = [
      `Booked via PrepCorex CRM appointment page.`,
      `Guest: ${name}`,
      `Email: ${email}`,
      phone ? `Phone: ${phone}` : null,
      notes ? `Meeting agenda: ${notes}` : null,
    ].filter(Boolean);

    const event = await createAppointmentEvent({
      accessToken,
      calendarId: connection.calendarId,
      summary: `${schedule.title} — ${name}`,
      description: descriptionParts.join("\n"),
      startIso: match.startIso,
      endIso: match.endIso,
      timezone: schedule.timezone,
      attendeeEmail: email,
      attendeeName: name,
      locationType: schedule.locationType,
      locationText: schedule.locationText,
    });

    const ref = await getAdminDb().collection(CRM_APPOINTMENTS_COLLECTION).add({
      slug: schedule.slug,
      guestName: name,
      guestEmail: email,
      guestPhone: phone || null,
      notes: notes || null,
      startAt: match.startIso,
      endAt: match.endIso,
      timezone: schedule.timezone,
      durationMinutes: schedule.durationMinutes,
      googleEventId: event.eventId,
      googleHtmlLink: event.htmlLink,
      hangoutLink: event.hangoutLink,
      calendarId: connection.calendarId,
      status: "booked",
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      appointmentId: ref.id,
      startIso: match.startIso,
      endIso: match.endIso,
      hangoutLink: event.hangoutLink,
      htmlLink: event.htmlLink,
      message:
        "Appointment booked. Check your email for the calendar invite" +
        (event.hangoutLink ? " and Google Meet link." : "."),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Booking failed" },
      { status: 500 }
    );
  }
}

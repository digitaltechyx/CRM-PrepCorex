import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import {
  clearAppointmentConnection,
  getAppointmentSettings,
  sanitizeSettingsForAdmin,
  saveAppointmentSchedule,
} from "@/lib/appointments/settings-store";
import type { AppointmentScheduleConfig } from "@/lib/appointments/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const settings = await getAppointmentSettings();
  return NextResponse.json(sanitizeSettingsForAdmin(settings));
}

export async function PUT(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const body = (await request.json()) as { schedule?: AppointmentScheduleConfig };
    if (!body.schedule) {
      return NextResponse.json({ error: "schedule is required" }, { status: 400 });
    }
    await saveAppointmentSchedule(body.schedule);
    const settings = await getAppointmentSettings();
    return NextResponse.json(sanitizeSettingsForAdmin(settings));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  await clearAppointmentConnection();
  const settings = await getAppointmentSettings();
  return NextResponse.json(sanitizeSettingsForAdmin(settings));
}

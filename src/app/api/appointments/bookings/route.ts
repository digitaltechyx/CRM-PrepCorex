import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { CRM_APPOINTMENTS_COLLECTION } from "@/lib/appointments/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 40)));
  const snap = await getAdminDb()
    .collection(CRM_APPOINTMENTS_COLLECTION)
    .orderBy("startAt", "desc")
    .limit(limit)
    .get()
    .catch(async () =>
      getAdminDb().collection(CRM_APPOINTMENTS_COLLECTION).limit(limit).get()
    );

  const bookings = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      guestName: String(data.guestName || ""),
      guestEmail: String(data.guestEmail || ""),
      guestPhone: data.guestPhone != null ? String(data.guestPhone) : null,
      startAt: String(data.startAt || ""),
      endAt: String(data.endAt || ""),
      hangoutLink: data.hangoutLink != null ? String(data.hangoutLink) : null,
      googleHtmlLink: data.googleHtmlLink != null ? String(data.googleHtmlLink) : null,
      status: String(data.status || "booked"),
      notes: data.notes != null ? String(data.notes) : null,
    };
  });

  return NextResponse.json({ bookings });
}

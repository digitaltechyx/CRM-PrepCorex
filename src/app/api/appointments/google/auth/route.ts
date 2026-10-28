import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { createCalendarOAuthState } from "@/lib/appointments/oauth-state";
import { buildGoogleCalendarAuthUrl } from "@/lib/appointments/google-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const origin = request.nextUrl.origin;
    const state = createCalendarOAuthState(auth.uid);
    const authUrl = buildGoogleCalendarAuthUrl({ origin, state });
    return NextResponse.json({ authUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start Google Calendar connect" },
      { status: 500 }
    );
  }
}

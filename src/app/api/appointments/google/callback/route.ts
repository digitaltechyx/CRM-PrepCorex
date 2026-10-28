import { NextRequest, NextResponse } from "next/server";
import { verifyCalendarOAuthState } from "@/lib/appointments/oauth-state";
import {
  exchangeCalendarAuthCode,
  listWritableCalendars,
  parseEmailFromOAuth,
} from "@/lib/appointments/google-calendar";
import { saveAppointmentConnection } from "@/lib/appointments/settings-store";
import type { GoogleCalendarConnection } from "@/lib/appointments/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code") || "";
  const state = request.nextUrl.searchParams.get("state") || "";
  const oauthError = request.nextUrl.searchParams.get("error");

  const redirectBase = `${origin}/dashboard/appointments`;

  if (oauthError) {
    return NextResponse.redirect(
      `${redirectBase}?google=error&message=${encodeURIComponent(oauthError)}`
    );
  }

  const verified = verifyCalendarOAuthState(state);
  if (!verified || !code) {
    return NextResponse.redirect(
      `${redirectBase}?google=error&message=${encodeURIComponent("Invalid or expired OAuth state")}`
    );
  }

  try {
    const tokens = await exchangeCalendarAuthCode(code, origin);
    if (!tokens.refreshToken) {
      return NextResponse.redirect(
        `${redirectBase}?google=error&message=${encodeURIComponent(
          "No refresh token returned. Disconnect the app in Google Account permissions and try again with consent."
        )}`
      );
    }

    const email = parseEmailFromOAuth(tokens.idToken);
    let calendarId = "primary";
    let calendarSummary = "Primary";
    try {
      const list = await listWritableCalendars(tokens.accessToken);
      const primary = list.find((c) => c.primary) || list[0];
      if (primary?.id) {
        calendarId = primary.id;
        calendarSummary = primary.summary;
      }
    } catch {
      /* keep primary */
    }

    const connection: GoogleCalendarConnection = {
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: Date.now() + tokens.expiresIn * 1000,
      googleEmail: email || undefined,
      calendarId,
      calendarSummary,
      calendarCreatedByUs: false,
      connectedAt: new Date().toISOString(),
      connectedByUid: verified.uid,
    };
    await saveAppointmentConnection(connection);

    return NextResponse.redirect(`${redirectBase}?google=connected`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "OAuth failed";
    return NextResponse.redirect(
      `${redirectBase}?google=error&message=${encodeURIComponent(message)}`
    );
  }
}

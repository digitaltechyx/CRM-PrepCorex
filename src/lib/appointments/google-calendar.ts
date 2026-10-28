import {
  getAppointmentSettings,
  saveAppointmentConnection,
} from "@/lib/appointments/settings-store";
import type { GoogleCalendarConnection } from "@/lib/appointments/types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar",
  "openid",
  "email",
  "profile",
].join(" ");

function clientId() {
  return process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim() || "";
}

function clientSecret() {
  return (
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    ""
  );
}

export function getGoogleCalendarOAuthConfig(origin: string) {
  const id = clientId();
  const secret = clientSecret();
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ||
    `${origin.replace(/\/$/, "")}/api/appointments/google/callback`;
  return { clientId: id, clientSecret: secret, redirectUri };
}

export function buildGoogleCalendarAuthUrl(input: {
  origin: string;
  state: string;
}): string {
  const { clientId: id, redirectUri } = getGoogleCalendarOAuthConfig(input.origin);
  if (!id) throw new Error("GOOGLE_CALENDAR_CLIENT_ID is not configured");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeCalendarAuthCode(code: string, origin: string) {
  const { clientId: id, clientSecret: secret, redirectUri } = getGoogleCalendarOAuthConfig(origin);
  if (!id || !secret) throw new Error("Google Calendar OAuth client is not configured");

  const body = new URLSearchParams({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error_description || json.error || "Token exchange failed"));
  }
  return {
    accessToken: String(json.access_token || ""),
    refreshToken: String(json.refresh_token || ""),
    expiresIn: Number(json.expires_in || 3600),
    idToken: typeof json.id_token === "string" ? json.id_token : null,
  };
}

function emailFromIdToken(idToken: string | null): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
    };
    return json.email?.trim() || null;
  } catch {
    return null;
  }
}

async function refreshAccessToken(refreshToken: string) {
  const { clientId: id, clientSecret: secret } = getGoogleCalendarOAuthConfig("");
  if (!id || !secret) throw new Error("Google Calendar OAuth client is not configured");
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error_description || json.error || "Token refresh failed"));
  }
  return {
    accessToken: String(json.access_token || ""),
    expiresIn: Number(json.expires_in || 3600),
  };
}

export async function getValidAccessToken(
  connection?: GoogleCalendarConnection | null
): Promise<{ accessToken: string; connection: GoogleCalendarConnection }> {
  const settings = connection ? null : await getAppointmentSettings();
  const conn = connection || settings?.connection;
  if (!conn?.refreshToken) throw new Error("Google Calendar is not connected");

  const expiresAt = Number(conn.accessTokenExpiresAt || 0);
  if (conn.accessToken && expiresAt > Date.now() + 60_000) {
    return { accessToken: conn.accessToken, connection: conn };
  }

  const refreshed = await refreshAccessToken(conn.refreshToken);
  const next: GoogleCalendarConnection = {
    ...conn,
    accessToken: refreshed.accessToken,
    accessTokenExpiresAt: Date.now() + refreshed.expiresIn * 1000,
  };
  await saveAppointmentConnection(next);
  return { accessToken: next.accessToken!, connection: next };
}

async function calFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit & { query?: Record<string, string> }
): Promise<T> {
  const url = new URL(`${CAL_BASE}${path}`);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  }
  const { query: _q, ...rest } = init || {};
  const res = await fetch(url.toString(), {
    ...rest,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(rest.headers || {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json?.error?.message || `Google Calendar API ${res.status}`);
  }
  return json;
}

export type GoogleCalendarListItem = {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
};

export async function listWritableCalendars(
  accessToken: string
): Promise<GoogleCalendarListItem[]> {
  const data = await calFetch<{ items?: Array<Record<string, unknown>> }>(
    "/users/me/calendarList",
    accessToken,
    { query: { minAccessRole: "writer" } }
  );
  return (data.items || []).map((item) => ({
    id: String(item.id || ""),
    summary: String(item.summary || item.id || "Calendar"),
    primary: item.primary === true,
    accessRole: item.accessRole != null ? String(item.accessRole) : undefined,
    backgroundColor:
      item.backgroundColor != null ? String(item.backgroundColor) : undefined,
  }));
}

export async function createNamedCalendar(
  accessToken: string,
  summary: string
): Promise<GoogleCalendarListItem> {
  const created = await calFetch<{ id?: string; summary?: string }>(
    "/calendars",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        summary: summary.trim().slice(0, 80) || "PrepCorex Appointments",
        timeZone: "America/New_York",
      }),
    }
  );
  return {
    id: String(created.id || ""),
    summary: String(created.summary || summary),
  };
}

export async function queryFreeBusy(input: {
  accessToken: string;
  calendarId: string;
  timeMinIso: string;
  timeMaxIso: string;
}): Promise<Array<{ start: string; end: string }>> {
  const data = await calFetch<{
    calendars?: Record<string, { busy?: Array<{ start?: string; end?: string }> }>;
  }>("/freeBusy", input.accessToken, {
    method: "POST",
    body: JSON.stringify({
      timeMin: input.timeMinIso,
      timeMax: input.timeMaxIso,
      items: [{ id: input.calendarId }],
    }),
  });
  const busy = data.calendars?.[input.calendarId]?.busy || [];
  return busy
    .map((b) => ({ start: String(b.start || ""), end: String(b.end || "") }))
    .filter((b) => b.start && b.end);
}

export async function createAppointmentEvent(input: {
  accessToken: string;
  calendarId: string;
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  timezone: string;
  attendeeEmail: string;
  attendeeName: string;
  locationType: string;
  locationText?: string;
}): Promise<{ eventId: string; htmlLink: string | null; hangoutLink: string | null }> {
  const wantMeet = input.locationType === "google_meet";
  const location =
    input.locationType === "in_person" || input.locationType === "custom"
      ? input.locationText?.trim() || undefined
      : input.locationType === "phone"
        ? input.locationText?.trim() || "Phone call"
        : undefined;

  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startIso, timeZone: input.timezone },
    end: { dateTime: input.endIso, timeZone: input.timezone },
    attendees: [
      {
        email: input.attendeeEmail,
        displayName: input.attendeeName || undefined,
      },
    ],
    reminders: {
      useDefault: true,
    },
  };
  if (location) body.location = location;
  if (wantMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `pcx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const query: Record<string, string> = {
    sendUpdates: "all",
  };
  if (wantMeet) query.conferenceDataVersion = "1";

  const created = await calFetch<{
    id?: string;
    htmlLink?: string;
    hangoutLink?: string;
  }>(`/calendars/${encodeURIComponent(input.calendarId)}/events`, input.accessToken, {
    method: "POST",
    query,
    body: JSON.stringify(body),
  });

  return {
    eventId: String(created.id || ""),
    htmlLink: created.htmlLink ? String(created.htmlLink) : null,
    hangoutLink: created.hangoutLink ? String(created.hangoutLink) : null,
  };
}

export function parseEmailFromOAuth(idToken: string | null) {
  return emailFromIdToken(idToken);
}

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { CRM_SETTINGS_COLLECTION } from "@/lib/mailbox-types";
import {
  APPOINTMENT_SETTINGS_DOC,
  DEFAULT_SCHEDULE,
  type AppointmentScheduleConfig,
  type AppointmentSettingsDoc,
  type GoogleCalendarConnection,
  type PublicScheduleMeta,
} from "@/lib/appointments/types";

function settingsRef() {
  return getAdminDb().collection(CRM_SETTINGS_COLLECTION).doc(APPOINTMENT_SETTINGS_DOC);
}

export async function getAppointmentSettings(): Promise<AppointmentSettingsDoc> {
  const snap = await settingsRef().get();
  const data = (snap.exists ? snap.data() : {}) as Partial<AppointmentSettingsDoc>;
  return {
    connection: (data.connection as GoogleCalendarConnection | null) ?? null,
    schedule: {
      ...DEFAULT_SCHEDULE,
      ...(data.schedule || {}),
      workingHours: {
        ...DEFAULT_SCHEDULE.workingHours,
        ...(data.schedule?.workingHours || {}),
      },
    },
    updatedAt: data.updatedAt,
  };
}

export async function saveAppointmentConnection(
  connection: GoogleCalendarConnection
): Promise<void> {
  await settingsRef().set(
    {
      connection,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function clearAppointmentConnection(): Promise<void> {
  await settingsRef().set(
    {
      connection: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveAppointmentSchedule(
  schedule: AppointmentScheduleConfig
): Promise<void> {
  const slug = schedule.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  await settingsRef().set(
    {
      schedule: {
        ...schedule,
        slug: slug || DEFAULT_SCHEDULE.slug,
        title: schedule.title.trim().slice(0, 120) || DEFAULT_SCHEDULE.title,
        description: schedule.description.trim().slice(0, 2000),
        durationMinutes: Math.min(180, Math.max(5, Math.floor(schedule.durationMinutes || 30))),
        bufferBeforeMinutes: Math.max(0, Math.floor(schedule.bufferBeforeMinutes || 0)),
        bufferAfterMinutes: Math.max(0, Math.floor(schedule.bufferAfterMinutes || 0)),
        minNoticeHours: Math.max(0, Math.floor(schedule.minNoticeHours || 0)),
        maxDaysAhead: Math.min(90, Math.max(1, Math.floor(schedule.maxDaysAhead || 28))),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getPublicScheduleBySlug(
  slug: string
): Promise<{ settings: AppointmentSettingsDoc; meta: PublicScheduleMeta } | null> {
  const settings = await getAppointmentSettings();
  const want = slug.trim().toLowerCase();
  if (!want || settings.schedule.slug !== want) return null;
  if (!settings.connection?.refreshToken || !settings.connection.calendarId) return null;
  const meta: PublicScheduleMeta = {
    slug: settings.schedule.slug,
    title: settings.schedule.title,
    description: settings.schedule.description,
    durationMinutes: settings.schedule.durationMinutes,
    timezone: settings.schedule.timezone,
    locationType: settings.schedule.locationType,
    locationText: settings.schedule.locationText,
    enabled: settings.schedule.enabled,
    maxDaysAhead: settings.schedule.maxDaysAhead,
  };
  return { settings, meta };
}

/** Safe admin view — never return refresh token to the browser. */
export function sanitizeSettingsForAdmin(doc: AppointmentSettingsDoc) {
  const c = doc.connection;
  return {
    connected: Boolean(c?.refreshToken),
    googleEmail: c?.googleEmail || null,
    calendarId: c?.calendarId || null,
    calendarSummary: c?.calendarSummary || null,
    calendarCreatedByUs: Boolean(c?.calendarCreatedByUs),
    connectedAt: c?.connectedAt || null,
    schedule: doc.schedule,
  };
}

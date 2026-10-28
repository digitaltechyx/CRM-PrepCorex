export const APPOINTMENT_SETTINGS_DOC = "googleCalendarAppointments";
export const CRM_APPOINTMENTS_COLLECTION = "crmAppointments";

export type WeekdayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export type TimeRange = { start: string; end: string }; // "09:00" 24h local to schedule timezone

export type AppointmentLocationType = "google_meet" | "phone" | "in_person" | "custom";

export type AppointmentScheduleConfig = {
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  timezone: string;
  workingHours: Partial<Record<WeekdayKey, TimeRange[]>>;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  /** How many hours ahead a guest must book. */
  minNoticeHours: number;
  /** How many days ahead the calendar opens. */
  maxDaysAhead: number;
  locationType: AppointmentLocationType;
  locationText: string;
  enabled: boolean;
};

export type GoogleCalendarConnection = {
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  googleEmail?: string;
  calendarId: string;
  calendarSummary?: string;
  /** True when we created this calendar via API for appointments. */
  calendarCreatedByUs?: boolean;
  connectedAt?: string;
  connectedByUid?: string;
};

export type AppointmentSettingsDoc = {
  connection: GoogleCalendarConnection | null;
  schedule: AppointmentScheduleConfig;
  updatedAt?: unknown;
};

export type PublicScheduleMeta = {
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  timezone: string;
  locationType: AppointmentLocationType;
  locationText: string;
  enabled: boolean;
  maxDaysAhead: number;
};

export type BookableSlot = {
  startIso: string;
  endIso: string;
  label: string;
};

export const DEFAULT_SCHEDULE: AppointmentScheduleConfig = {
  slug: "prepcorex",
  title: "PrepCorex consultation",
  description: "Book a call with our team. You’ll get a calendar invite after confirming.",
  durationMinutes: 30,
  timezone: "America/New_York",
  workingHours: {
    mon: [{ start: "09:00", end: "17:00" }],
    tue: [{ start: "09:00", end: "17:00" }],
    wed: [{ start: "09:00", end: "17:00" }],
    thu: [{ start: "09:00", end: "17:00" }],
    fri: [{ start: "09:00", end: "17:00" }],
  },
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 15,
  minNoticeHours: 2,
  maxDaysAhead: 28,
  locationType: "google_meet",
  locationText: "",
  enabled: false,
};

export const WEEKDAY_KEYS: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Editable Mon–Fri rows in admin (weekend off by default). */
export const WORK_WEEK_DAYS: Array<{ key: WeekdayKey; label: string }> = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
];

export const APPOINTMENT_TIMEZONES: Array<{ value: string; label: string }> = [
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Toronto", label: "Eastern Time (Toronto)" },
  { value: "Europe/London", label: "UK (London)" },
  { value: "Europe/Paris", label: "Central Europe (Paris)" },
  { value: "Asia/Karachi", label: "Pakistan (Karachi)" },
  { value: "Asia/Dubai", label: "UAE (Dubai)" },
  { value: "Asia/Kolkata", label: "India (Kolkata)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Australia (Sydney)" },
  { value: "UTC", label: "UTC" },
];

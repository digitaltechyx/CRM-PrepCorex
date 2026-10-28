# Google Calendar appointment booking (CRM-PrepCorex)

Rebuilds Google Workspace **Appointment schedules** using the **Calendar API**, so it works on Workspace **Starter** (without paying for Standard’s built-in booking product).

## What guests get

Public page: `/book/{slug}` (default slug `prepcorex`)

1. Pick a day  
2. Pick an open time (FreeBusy-aware)  
3. Enter name / email / phone / notes  
4. Confirm → event is created on the company Google Calendar + invite email (+ Meet if enabled)

## What admin gets

Dashboard: **Appointments**

1. Connect Google (OAuth)  
2. **Reuse an existing calendar** or **create a new** “PrepCorex Appointments” calendar  
3. Configure title, duration, timezone, Meet/location, buffers, enable public link  
4. See recent bookings (also open in Google Calendar)

Booked events sync to phone/desktop Google Calendar for that account — same as any normal calendar event.

## Create a new Google Cloud OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.  
2. **APIs & Services → Library** → enable **Google Calendar API**.  
3. **APIs & Services → OAuth consent screen**  
   - External (or Internal if Workspace-only)  
   - Add scopes: `calendar`, `calendar.events`, `email`, `profile`, `openid`  
4. **Credentials → Create credentials → OAuth client ID → Web application**  
   - Authorized redirect URIs:  
     - `http://localhost:3001/api/appointments/google/callback`  
     - `https://crm.prepservicesfba.com/api/appointments/google/callback` (or your CRM host)  
5. Copy Client ID + Client Secret into CRM `.env.local` / Vercel:

```env
GOOGLE_CALENDAR_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=....
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3001/api/appointments/google/callback
```

On production, set `GOOGLE_CALENDAR_REDIRECT_URI` to the HTTPS callback URL.

6. Restart `npm run dev`, open **Appointments → Connect Google Calendar**.

## Firestore

| Path | Purpose |
|------|---------|
| `crm_settings/googleCalendarAppointments` | OAuth tokens + schedule config |
| `crmAppointments` | Booking log (guest + Google event id) |

Ensure CRM admins can read/write `crm_settings` and `crmAppointments` (same access pattern as other CRM settings).

## Notes

- One **company** calendar connection for v1 (not per-rep).  
- Working hours default Mon–Fri 09:00–17:00 in the schedule timezone.  
- Disconnect / reconnect with `prompt=consent` if Google does not return a refresh token.

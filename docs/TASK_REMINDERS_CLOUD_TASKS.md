# Personal task reminders (Cloud Tasks)

## How it works

1. Admin saves a note with start/end times in CRM.
2. Firestore trigger `syncCrmTaskReminderCloudTasks` creates **exact alarms**:
   - 20 minutes before start
   - at start
   - at end
3. Each alarm calls `POST /api/tasks/reminders/fire` at that time → FCM push.
4. A **backup** cron every **6 hours** catches anything missed (not the main path).

## One-time GCP setup

```bash
# Enable API
gcloud services enable cloudtasks.googleapis.com --project=YOUR_PROJECT_ID

# Create queue (us-central1 recommended; match CLOUD_TASKS_LOCATION)
gcloud tasks queues create crm-task-reminders \
  --location=us-central1 \
  --project=YOUR_PROJECT_ID
```

Grant the Cloud Functions / App Engine default service account permission to
enqueue tasks (usually already has Editor; minimum is Cloud Tasks Enqueuer).

## Functions env

Set in `functions/.env` or Firebase Functions config:

| Variable | Required | Example |
|----------|----------|---------|
| `CRON_SECRET` | yes | same as Vercel |
| `CLOUD_TASKS_LOCATION` | no | `us-central1` |
| `CLOUD_TASKS_QUEUE` | no | `crm-task-reminders` |
| `TASK_FIRE_URL` | no | `https://crm.prepservicesfba.com/api/tasks/reminders/fire` |
| `TASK_REMINDERS_URL` | no | `https://crm.prepservicesfba.com/api/tasks/reminders` |

## Deploy

```bash
cd functions
npm install
firebase deploy --only functions:syncCrmTaskReminderCloudTasks,functions:sendCrmTaskRemindersBackup
```

Also deploy the CRM Next app so `/api/tasks/reminders/fire` exists.

## Cost note

You pay for Cloud Tasks deliveries when alarms fire, plus a small Firestore
write on each task save to store `cloudTaskNames`. You no longer poll every
30 minutes all day.

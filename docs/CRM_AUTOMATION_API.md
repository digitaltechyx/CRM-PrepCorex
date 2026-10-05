# PrepCorex CRM automation API (ChatGPT)

Repo: [digitaltechyx/CRM-PrepCorex](https://github.com/digitaltechyx/CRM-PrepCorex)

Server-side REST API for lead search/update, timeline activities, draft storage, and follow-up tasks against Firestore `crmLeads`.

**Base URLs**

- `https://crm.prepservicesfba.com`
- `https://crm-prep-corex.vercel.app`

## Authentication

```env
CRM_AUTOMATION_API_KEY=your-long-random-secret
```

Send on every request:

- `Authorization: Bearer <CRM_AUTOMATION_API_KEY>`
- or `x-api-key: <CRM_AUTOMATION_API_KEY>`

CRM-eligible Firebase admin tokens also work for testing.

## Field mapping (API ↔ Firestore)

| API field | Firestore |
|-----------|-----------|
| `name` / `leadName` | `leadName` |
| `stage` / `status` | `status` (`new_lead`, `contacted`, …) |
| `followUpDate` (`YYYY-MM-DD`) | `nextFollowUpAt` (Timestamp) |
| activity `summary` / `text` | timeline `text` |

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/crm/leads` | Search/list |
| POST | `/api/crm/leads` | Create |
| GET | `/api/crm/leads/{id}` | Get one |
| PATCH | `/api/crm/leads/{id}` | Update |
| GET/POST | `/api/crm/leads/{id}/activities` | Timeline |
| GET/PUT | `/api/crm/leads/{id}/draft` | Draft reply |
| GET | `/api/crm/tasks/overdue?scope=due` | Today + overdue |
| GET | `/api/crm/openapi` | OpenAPI for Custom GPT Actions |

### Task scopes

- `overdue` — before today
- `due` — **today + overdue** (use daily)
- `today` — today only

Timezone: `America/New_York`.

## ChatGPT setup

1. Deploy this repo with `CRM_AUTOMATION_API_KEY` set.
2. Custom GPT → Actions → import `{baseUrl}/api/crm/openapi`.
3. Auth: API Key, header `Authorization`, prefix `Bearer `.
4. Daily: `GET /api/crm/tasks/overdue?scope=due`.

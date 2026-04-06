# PSF CRM

Standalone **PrepCorex CRM** app: **lead management** (pipeline Kanban, list, follow-ups due today, timeline, CSV import), address book (scaffold), quote management, and invoice management. Uses the **same Firebase project** as PSF StockFlow.

### Lead data (`crmLeads`)

Leads are stored in Firestore at `crmLeads/{leadId}` with a `timeline` subcollection for notes and status changes. Deploy **Firestore rules** and **indexes** from the main StockFlow repo (`firestore.rules`, `firestore.indexes.json`) so admins/sub-admins can read/write `crmLeads`. After deploying rules, run `firebase deploy --only firestore:indexes` if the console asks for a composite index on `updatedAt`.

## Run locally

```bash
cd psf-crm
cp .env.example .env.local
# Fill .env.local (copy values from StockFlow where applicable)
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) (port **3001** so StockFlow can stay on 3000).

## Who can log in

Users who pass `canAccessCrm()` in `src/lib/crm-access.ts`:

- `admin`, or
- `sub_admin` with `manage_invoices`, `manage_quotes`, or `admin_dashboard`

## Deploy (e.g. Vercel)

1. Create a new Vercel project from **this** repository (or a repo that only contains `psf-crm` if you split it).
2. Set all variables from `.env.example` in the Vercel project settings.
3. Production URL example: `https://crm.yourdomain.com`.

## Push to your Git repo

If this folder was created next to StockFlow:

```bash
cd psf-crm
git init
git add .
git commit -m "Initial PSF CRM: invoices, quotes, lead/contact scaffolds"
git remote add origin https://github.com/YOUR_ORG/YOUR-CRM-REPO.git
git branch -M main
git push -u origin main
```

Or copy the `psf-crm` folder into your existing empty CRM repo, then commit there.

## Relation to StockFlow

- **Data**: same Firestore paths (`users`, quotes, invoices, etc.).
- **Code**: copied from StockFlow; update both sides when you change shared business logic, or later extract a shared package.

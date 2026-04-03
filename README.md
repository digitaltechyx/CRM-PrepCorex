# PSF CRM

Standalone **PrepCorex CRM** app: leads, address book (scaffolds), quote management, and invoice management. Uses the **same Firebase project** as PSF StockFlow so quotes and invoices read/write the same Firestore data.

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

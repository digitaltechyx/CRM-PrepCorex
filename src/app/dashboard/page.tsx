import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CrmDashboardLeadWidgets } from "@/components/crm/leads/crm-dashboard-lead-widgets";
import { Users, BookUser, Briefcase, Receipt } from "lucide-react";

const modules = [
  {
    title: "Leads",
    description: "Pipeline, follow-ups, CSV import, and timeline.",
    href: "/dashboard/leads",
    icon: Users,
  },
  {
    title: "Address book",
    description: "Contacts and companies (coming soon).",
    href: "/dashboard/contacts",
    icon: BookUser,
  },
  {
    title: "Quote management",
    description: "Create, send, and track quotes.",
    href: "/dashboard/quotes",
    icon: Briefcase,
  },
  {
    title: "Invoice management",
    description: "External invoices, payments, and email.",
    href: "/dashboard/invoice-portal",
    icon: Receipt,
  },
];

export default function CrmDashboardHomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="font-headline text-3xl font-bold tracking-tight">CRM</h1>
        <p className="text-muted-foreground">
          Same Firebase project as StockFlow — quotes and invoices use your existing data.
        </p>
      </div>
      <CrmDashboardLeadWidgets />

      <div className="grid gap-4 sm:grid-cols-2">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <Link key={m.href} href={m.href}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{m.title}</CardTitle>
                    <CardDescription>{m.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <span className="text-sm font-medium text-primary">Open →</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CrmDashboardAnalytics } from "@/components/crm/dashboard/crm-dashboard-analytics";
import { CrmDashboardLeadWidgets } from "@/components/crm/leads/crm-dashboard-lead-widgets";
import { Users, BookUser, Briefcase, Receipt, LayoutDashboard } from "lucide-react";

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
    <div className="relative mx-auto min-w-0 max-w-7xl space-y-10 pb-8">
      <div
        className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-gradient-to-br from-primary/20 via-violet-500/15 to-transparent blur-3xl"
        aria-hidden
      />
      <header className="relative space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary shadow-sm">
          <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
          Command center
        </div>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">CRM dashboard</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
          Run your revenue cycle from a single customer record: align pipeline activity with quotes and
          billing so every touchpoint stays consistent. Review performance and funnel health here, then open
          a module to work leads, proposals, or invoices.
        </p>
      </header>

      <CrmDashboardLeadWidgets />
      <CrmDashboardAnalytics />

      <section className="space-y-4">
        <h2 className="font-headline text-lg font-semibold tracking-tight">Modules</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.href} href={m.href}>
                <Card className="h-full border-border/80 bg-card/80 shadow-sm backdrop-blur-sm transition-all hover:border-primary/20 hover:shadow-md">
                  <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary ring-1 ring-primary/10">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{m.title}</CardTitle>
                      <CardDescription className="leading-relaxed">{m.description}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <span className="text-sm font-semibold text-primary">Open →</span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

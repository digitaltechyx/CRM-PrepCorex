"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCrmLeads } from "@/contexts/crm-leads-context";
import { computeLeadStats } from "@/lib/crm-lead-stats";
import { Users, Sparkles, CalendarClock, TrendingUp, UserCheck, Skull, Percent } from "lucide-react";

export function CrmDashboardLeadWidgets() {
  const { leads, loading, error } = useCrmLeads();
  const stats = computeLeadStats(leads);

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Leads</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  const items: { label: string; value: string; icon: typeof Users; href: string }[] = [
    { label: "Total leads", value: String(stats.total), icon: Users, href: "/dashboard/leads" },
    { label: "New today", value: String(stats.newToday), icon: Sparkles, href: "/dashboard/leads?tab=list" },
    { label: "Follow-ups due today", value: String(stats.dueToday), icon: CalendarClock, href: "/dashboard/leads?tab=due" },
    { label: "Interested / pipeline", value: String(stats.interested), icon: TrendingUp, href: "/dashboard/leads" },
    { label: "Clients", value: String(stats.clients), icon: UserCheck, href: "/dashboard/leads" },
    { label: "Dead / no reply", value: String(stats.dead), icon: Skull, href: "/dashboard/leads" },
    { label: "Conversion rate", value: `${stats.conversionRate}%`, icon: Percent, href: "/dashboard/leads" },
  ];

  return (
    <Card className="border-border/80 bg-card/90 shadow-sm backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="font-headline text-lg">Lead snapshot</CardTitle>
          <p className="text-sm text-muted-foreground">Key counts at a glance</p>
        </div>
        <Link href="/dashboard/leads" className="text-sm font-medium text-primary hover:underline">
          Open leads →
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading leads…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} href={item.href} className="group block">
                  <div className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-background to-muted/20 p-3.5 shadow-sm transition-all hover:border-primary/25 hover:shadow-md">
                    <div
                      className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                    <div className="rounded-lg bg-primary/10 p-2.5 text-primary ring-1 ring-primary/10 transition-transform group-hover:scale-105">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-muted-foreground">{item.label}</p>
                      <p className="text-xl font-bold tabular-nums tracking-tight">{item.value}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { endOfDay, isWithinInterval, startOfDay } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCrmLeads } from "@/contexts/crm-leads-context";
import type { CrmLead } from "@/contexts/crm-leads-context";
import { LeadKanban } from "@/components/crm/leads/lead-kanban";
import { QuickAddLeadDialog } from "@/components/crm/leads/quick-add-lead-dialog";
import { LeadDetailSheet } from "@/components/crm/leads/lead-detail-sheet";
import { LeadsToolbar, filterLeads } from "@/components/crm/leads/leads-toolbar";
import { LeadsListTable } from "@/components/crm/leads/leads-list-table";
import { LeadsCsvImportButton } from "@/components/crm/leads/leads-csv-import";
import { computeLeadStats } from "@/lib/crm-lead-stats";
import { firestoreTimestampToDate } from "@/lib/crm-date-utils";
import { Loader2, Sparkles } from "lucide-react";

function dueTodayLeads(leads: CrmLead[], now = new Date()) {
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  return leads.filter((l) => {
    if (l.status === "dead" || l.status === "client") return false;
    const n = firestoreTimestampToDate(l.nextFollowUpAt ?? undefined);
    return n && isWithinInterval(n, { start: dayStart, end: dayEnd });
  });
}

export function LeadsPageClient() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<"board" | "list" | "due">("board");

  useEffect(() => {
    const t = tabParam === "due" ? "due" : tabParam === "list" ? "list" : "board";
    setTab(t);
  }, [tabParam]);
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [country, setCountry] = useState("");
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { leads, loading, error } = useCrmLeads();

  const filtered = useMemo(
    () => filterLeads(leads, { search, platform, status, country }),
    [leads, search, platform, status, country]
  );

  const dueFiltered = useMemo(() => dueTodayLeads(filtered), [filtered]);
  const stats = useMemo(() => computeLeadStats(leads), [leads]);

  function openLead(l: CrmLead) {
    setSelected(l);
    setSheetOpen(true);
  }

  const selectedFresh = useMemo(() => {
    if (!selected) return null;
    return leads.find((l) => l.id === selected.id) ?? selected;
  }, [selected, leads]);

  return (
    <div className="relative mx-auto min-w-0 max-w-[1600px] space-y-6">
      <div
        className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-primary/20 via-violet-500/10 to-transparent blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Live pipeline
          </div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Lead management
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Pipeline, follow-ups, and timeline — synced to Firestore.{" "}
            <span className="font-semibold text-foreground/80">{stats.total}</span>{" "}
            {stats.total === 1 ? "lead" : "leads"} in your workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:pb-0.5">
          <LeadsCsvImportButton />
          <QuickAddLeadDialog />
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/60">
          <CardHeader>
            <CardTitle className="text-destructive">Could not load leads</CardTitle>
            <CardDescription>
              Deploy updated Firestore rules if you see permission errors. Admins and sub-admins can access{" "}
              <code className="text-xs">crmLeads</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <LeadsToolbar
        search={search}
        onSearchChange={setSearch}
        platform={platform}
        onPlatformChange={setPlatform}
        status={status}
        onStatusChange={setStatus}
        country={country}
        onCountryChange={setCountry}
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid h-11 w-full max-w-md grid-cols-3 gap-1 rounded-xl border border-border/60 bg-muted/40 p-1 shadow-inner">
          <TabsTrigger
            value="board"
            className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-border/60"
          >
            Pipeline
          </TabsTrigger>
          <TabsTrigger
            value="list"
            className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-border/60"
          >
            List
          </TabsTrigger>
          <TabsTrigger
            value="due"
            className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-border/60"
          >
            Due today
          </TabsTrigger>
        </TabsList>
        <TabsContent value="board" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <LeadKanban leads={filtered} onOpenLead={openLead} />
          )}
        </TabsContent>
        <TabsContent value="list" className="mt-4">
          <LeadsListTable leads={filtered} onOpen={openLead} />
        </TabsContent>
        <TabsContent value="due" className="mt-4">
          <Card className="overflow-hidden border-border/70 shadow-md ring-1 ring-black/[0.03] dark:ring-white/[0.05]">
            <CardHeader className="border-b border-border/50 bg-gradient-to-r from-amber-500/8 via-transparent to-primary/5">
              <CardTitle className="text-lg">Follow-ups due today</CardTitle>
              <CardDescription>Leads with next follow-up date today (excludes client & dead).</CardDescription>
            </CardHeader>
            <CardContent>
              <LeadsListTable leads={dueFiltered} onOpen={openLead} showListChrome={false} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <LeadDetailSheet lead={selectedFresh} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

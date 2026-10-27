"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PLATFORM_SOURCES,
  PLATFORM_LABELS,
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
} from "@/lib/crm-lead-schema";
import type { PlatformSource, LeadStatus } from "@/lib/crm-lead-schema";
import { useCrmPipeline } from "@/contexts/crm-pipeline-context";
import { firestoreTimestampToDate } from "@/lib/crm-date-utils";
import type { CrmLead } from "@/contexts/crm-leads-context";

export type LeadFilterOpts = {
  search: string;
  platform: string;
  status: string;
  country: string;
  businessType?: string;
  phone?: string;
  archivedFrom?: string;
  archivedTo?: string;
};

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  platform: string;
  onPlatformChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  country: string;
  onCountryChange: (v: string) => void;
  /** Extra filters for Archive tab */
  expanded?: boolean;
  businessType?: string;
  onBusinessTypeChange?: (v: string) => void;
  phone?: string;
  onPhoneChange?: (v: string) => void;
  archivedFrom?: string;
  onArchivedFromChange?: (v: string) => void;
  archivedTo?: string;
  onArchivedToChange?: (v: string) => void;
};

export function LeadsToolbar({
  search,
  onSearchChange,
  platform,
  onPlatformChange,
  status,
  onStatusChange,
  country,
  onCountryChange,
  expanded,
  businessType = "all",
  onBusinessTypeChange,
  phone = "",
  onPhoneChange,
  archivedFrom = "",
  onArchivedFromChange,
  archivedTo = "",
  onArchivedToChange,
}: Props) {
  const { statuses, getLabel } = useCrmPipeline();
  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm dark:bg-card/50 dark:ring-white/[0.05]">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {expanded ? "Archive filters" : "Filters"}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1 sm:min-w-[200px]">
          <label className="mb-1.5 block text-xs font-semibold text-foreground/80">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              className="h-10 rounded-xl border-border/80 bg-background/80 pl-9 shadow-inner transition-shadow focus-visible:ring-primary/30"
              placeholder={
                expanded
                  ? "Name, email, company, phone…"
                  : "Name, email, company…"
              }
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
        <div className="w-full sm:w-40">
          <label className="mb-1.5 block text-xs font-semibold text-foreground/80">Platform</label>
          <Select value={platform} onValueChange={onPlatformChange}>
            <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background/80">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              {PLATFORM_SOURCES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <label className="mb-1.5 block text-xs font-semibold text-foreground/80">Status</label>
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background/80">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {getLabel(s.id)}
                  {s.hidden ? " (hidden)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-36">
          <label className="mb-1.5 block text-xs font-semibold text-foreground/80">Country</label>
          <Input
            className="h-10 rounded-xl border-border/80 bg-background/80 shadow-inner transition-shadow focus-visible:ring-primary/30"
            placeholder="e.g. USA"
            value={country}
            onChange={(e) => onCountryChange(e.target.value)}
          />
        </div>
        {expanded ? (
          <>
            <div className="w-full sm:w-44">
              <label className="mb-1.5 block text-xs font-semibold text-foreground/80">
                Business type
              </label>
              <Select value={businessType} onValueChange={(v) => onBusinessTypeChange?.(v)}>
                <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background/80">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {BUSINESS_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {BUSINESS_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-40">
              <label className="mb-1.5 block text-xs font-semibold text-foreground/80">Phone</label>
              <Input
                className="h-10 rounded-xl border-border/80 bg-background/80 shadow-inner transition-shadow focus-visible:ring-primary/30"
                placeholder="Contains…"
                value={phone}
                onChange={(e) => onPhoneChange?.(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="mb-1.5 block text-xs font-semibold text-foreground/80">
                Archived from
              </label>
              <Input
                type="date"
                className="h-10 rounded-xl border-border/80 bg-background/80 shadow-inner transition-shadow focus-visible:ring-primary/30"
                value={archivedFrom}
                onChange={(e) => onArchivedFromChange?.(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="mb-1.5 block text-xs font-semibold text-foreground/80">
                Archived to
              </label>
              <Input
                type="date"
                className="h-10 rounded-xl border-border/80 bg-background/80 shadow-inner transition-shadow focus-visible:ring-primary/30"
                value={archivedTo}
                onChange={(e) => onArchivedToChange?.(e.target.value)}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function filterLeads<
  T extends {
    leadName: string;
    email?: string;
    company?: string;
    phone?: string;
    platformSource: PlatformSource;
    status: LeadStatus;
    country?: string;
    businessType?: string;
    archivedAt?: CrmLead["archivedAt"];
  },
>(leads: T[], opts: LeadFilterOpts): T[] {
  const q = opts.search.trim().toLowerCase();
  const ctry = opts.country.trim().toLowerCase();
  const phoneQ = (opts.phone || "").trim().toLowerCase();
  const biz = opts.businessType || "all";
  const from = (opts.archivedFrom || "").trim();
  const to = (opts.archivedTo || "").trim();
  const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;

  return leads.filter((l) => {
    if (opts.platform !== "all" && l.platformSource !== opts.platform) return false;
    if (opts.status !== "all" && l.status !== opts.status) return false;
    if (ctry && !(l.country || "").toLowerCase().includes(ctry)) return false;
    if (biz !== "all" && String(l.businessType || "") !== biz) return false;
    if (phoneQ && !(l.phone || "").toLowerCase().includes(phoneQ)) return false;
    if (fromMs != null || toMs != null) {
      const archivedAt = firestoreTimestampToDate(l.archivedAt ?? undefined)?.getTime();
      if (archivedAt == null) return false;
      if (fromMs != null && archivedAt < fromMs) return false;
      if (toMs != null && archivedAt > toMs) return false;
    }
    if (q) {
      const blob = `${l.leadName} ${l.email ?? ""} ${l.company ?? ""} ${l.phone ?? ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

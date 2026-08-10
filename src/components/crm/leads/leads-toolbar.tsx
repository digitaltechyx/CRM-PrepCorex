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
import { PLATFORM_SOURCES, PLATFORM_LABELS } from "@/lib/crm-lead-schema";
import type { PlatformSource, LeadStatus } from "@/lib/crm-lead-schema";
import { useCrmPipeline } from "@/contexts/crm-pipeline-context";

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  platform: string;
  onPlatformChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  country: string;
  onCountryChange: (v: string) => void;
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
}: Props) {
  const { statuses, getLabel } = useCrmPipeline();
  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm dark:bg-card/50 dark:ring-white/[0.05]">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-[200px] flex-1">
        <label className="mb-1.5 block text-xs font-semibold text-foreground/80">Search</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            className="h-10 rounded-xl border-border/80 bg-background/80 pl-9 shadow-inner transition-shadow focus-visible:ring-primary/30"
            placeholder="Name, email, company…"
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
      </div>
    </div>
  );
}

export function filterLeads<T extends { leadName: string; email?: string; company?: string; platformSource: PlatformSource; status: LeadStatus; country?: string }>(
  leads: T[],
  opts: { search: string; platform: string; status: string; country: string }
): T[] {
  const q = opts.search.trim().toLowerCase();
  const ctry = opts.country.trim().toLowerCase();
  return leads.filter((l) => {
    if (opts.platform !== "all" && l.platformSource !== opts.platform) return false;
    if (opts.status !== "all" && l.status !== opts.status) return false;
    if (ctry && !(l.country || "").toLowerCase().includes(ctry)) return false;
    if (q) {
      const blob = `${l.leadName} ${l.email ?? ""} ${l.company ?? ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

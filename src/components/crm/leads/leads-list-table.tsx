"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, ChevronRight, Mail } from "lucide-react";
import type { CrmLead } from "@/contexts/crm-leads-context";
import { PLATFORM_LABELS, PIPELINE_STATUSES, STATUS_LABELS } from "@/lib/crm-lead-schema";
import { firestoreTimestampToDate } from "@/lib/crm-date-utils";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { LEAD_STATUS_PILL_CLASS, platformPillClass } from "@/lib/crm-lead-badges";

type Props = {
  leads: CrmLead[];
  onOpen: (l: CrmLead) => void;
  /** When false, hide the list title bar (e.g. inside "Due today" card). */
  showListChrome?: boolean;
};

type SortKey = "name" | "source" | "status" | "followup";

function sortLeads(list: CrmLead[], key: SortKey, dir: "asc" | "desc"): CrmLead[] {
  const next = [...list];
  const sign = dir === "asc" ? 1 : -1;
  next.sort((a, b) => {
    if (key === "name") {
      return sign * a.leadName.localeCompare(b.leadName, undefined, { sensitivity: "base" });
    }
    if (key === "source") {
      const la = PLATFORM_LABELS[a.platformSource];
      const lb = PLATFORM_LABELS[b.platformSource];
      return sign * la.localeCompare(lb, undefined, { sensitivity: "base" });
    }
    if (key === "status") {
      const ia = PIPELINE_STATUSES.indexOf(a.status);
      const ib = PIPELINE_STATUSES.indexOf(b.status);
      return sign * (ia - ib);
    }
    const ta = firestoreTimestampToDate(a.nextFollowUpAt ?? undefined)?.getTime();
    const tb = firestoreTimestampToDate(b.nextFollowUpAt ?? undefined)?.getTime();
    const na = ta ?? (dir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    const nb = tb ?? (dir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    return sign * (na - nb);
  });
  return next;
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={cn("h-12 px-4 text-left align-middle", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground",
          active && "bg-muted/60 text-foreground"
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );
}

export function LeadsListTable({ leads, onOpen, showListChrome = true }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => sortLeads(leads, sortKey, sortDir), [leads, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-muted-foreground/25 bg-muted/20 py-14 text-center">
        <p className="text-sm font-semibold text-foreground/80">No leads match your filters</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Try clearing search or changing platform / status, or add a new lead.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showListChrome ? (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">List view</h2>
            <p className="text-xs text-muted-foreground">
              Sort columns to organize. Row opens the lead detail panel.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{sorted.length}</span> shown
          </p>
        </div>
      ) : null}

      {/* Mobile: cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {sorted.map((l) => {
          const next = firestoreTimestampToDate(l.nextFollowUpAt ?? undefined);
          const statusClass = LEAD_STATUS_PILL_CLASS[l.status];
          const srcClass = platformPillClass(l.platformSource);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onOpen(l)}
              className="group flex w-full flex-col gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 text-left shadow-sm ring-1 ring-black/[0.03] transition-all active:scale-[0.99] dark:bg-card/50 dark:ring-white/[0.05]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight text-foreground">{l.leadName}</p>
                  {l.company ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className="truncate">{l.company}</span>
                    </p>
                  ) : null}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex max-w-full truncate rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                    srcClass
                  )}
                >
                  {PLATFORM_LABELS[l.platformSource]}
                </span>
                <span
                  className={cn(
                    "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                    statusClass
                  )}
                >
                  {STATUS_LABELS[l.status]}
                </span>
              </div>
              {l.email ? (
                <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {l.email}
                </p>
              ) : null}
              <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                <span className="text-muted-foreground">{l.country || "—"}</span>
                <span className="font-medium text-foreground/90">
                  {next && l.status !== "dead" && l.status !== "client"
                    ? format(next, "MMM d, yyyy")
                    : "—"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-xl border border-border/70 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05] md:block">
        <div className="max-h-[min(65vh,600px)] overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="sticky top-0 z-10 border-b border-border/60 bg-card/95 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/85">
              <tr className="border-b border-border/40">
                <SortableTh
                  label="Name"
                  active={sortKey === "name"}
                  dir={sortDir}
                  onClick={() => toggleSort("name")}
                />
                <th className="h-12 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Company
                </th>
                <SortableTh
                  label="Source"
                  active={sortKey === "source"}
                  dir={sortDir}
                  onClick={() => toggleSort("source")}
                />
                <th className="h-12 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Country
                </th>
                <SortableTh
                  label="Status"
                  active={sortKey === "status"}
                  dir={sortDir}
                  onClick={() => toggleSort("status")}
                />
                <SortableTh
                  label="Next follow-up"
                  active={sortKey === "followup"}
                  dir={sortDir}
                  onClick={() => toggleSort("followup")}
                  className="min-w-[9rem]"
                />
                <th className="h-12 w-10 px-2" aria-hidden />
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {sorted.map((l, i) => {
                const next = firestoreTimestampToDate(l.nextFollowUpAt ?? undefined);
                const statusClass = LEAD_STATUS_PILL_CLASS[l.status];
                const srcClass = platformPillClass(l.platformSource);
                return (
                  <tr
                    key={l.id}
                    className={cn(
                      "cursor-pointer border-b border-border/50 transition-colors hover:bg-primary/[0.04]",
                      i % 2 === 1 && "bg-muted/20 hover:bg-primary/[0.06]"
                    )}
                    onClick={() => onOpen(l)}
                  >
                    <td className="p-4 align-middle font-semibold text-foreground">{l.leadName}</td>
                    <td className="max-w-[10rem] truncate p-4 align-middle text-muted-foreground">
                      {l.company || "—"}
                    </td>
                    <td className="p-4 align-middle">
                      <span
                        className={cn(
                          "inline-flex max-w-[8.5rem] truncate rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                          srcClass
                        )}
                      >
                        {PLATFORM_LABELS[l.platformSource]}
                      </span>
                    </td>
                    <td className="p-4 align-middle text-muted-foreground">{l.country || "—"}</td>
                    <td className="p-4 align-middle">
                      <span
                        className={cn(
                          "inline-flex max-w-[11rem] truncate rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset",
                          statusClass
                        )}
                      >
                        {STATUS_LABELS[l.status]}
                      </span>
                    </td>
                    <td className="p-4 align-middle text-muted-foreground tabular-nums">
                      {next && l.status !== "dead" && l.status !== "client"
                        ? format(next, "MMM d, yyyy")
                        : "—"}
                    </td>
                    <td className="p-2 align-middle text-muted-foreground/50">
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

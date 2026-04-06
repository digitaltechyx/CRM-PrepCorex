"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Building2, Mail, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CrmLead } from "@/contexts/crm-leads-context";
import { PLATFORM_LABELS } from "@/lib/crm-lead-schema";
import { platformPillClass } from "@/lib/crm-lead-badges";
import { firestoreTimestampToDate } from "@/lib/crm-date-utils";
import { format } from "date-fns";

type Props = {
  lead: CrmLead;
  onOpen: (lead: CrmLead) => void;
  isDragging?: boolean;
  /** Lifted overlay while dragging (pipeline). */
  isOverlay?: boolean;
};

export function LeadKanbanCard({ lead, onOpen, isDragging, isOverlay }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging: dragging } = useDraggable({
    id: lead.id,
    data: { lead },
    disabled: Boolean(isOverlay),
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: dragging || isDragging ? 0.5 : 1,
  };

  const next = firestoreTimestampToDate(lead.nextFollowUpAt ?? undefined);

  const platform = lead.platformSource;
  const badgeClass = platformPillClass(platform);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "touch-none rounded-xl border border-border/80 bg-gradient-to-b from-card to-card/95 p-3 shadow-sm ring-1 ring-black/[0.03] transition-all duration-200 dark:ring-white/[0.06]",
        isOverlay && "rotate-2 scale-105 cursor-grabbing shadow-2xl ring-2 ring-primary/30",
        !dragging && !isDragging && !isOverlay && "hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md hover:ring-primary/10"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className={cn(
            "mt-0.5 touch-none rounded-md p-0.5 text-muted-foreground transition-colors",
            isOverlay ? "cursor-grabbing opacity-50" : "cursor-grab hover:bg-muted hover:text-foreground active:cursor-grabbing"
          )}
          {...(isOverlay ? {} : listeners)}
          {...(isOverlay ? {} : attributes)}
          aria-label={isOverlay ? undefined : "Drag to change stage"}
          aria-hidden={isOverlay ? true : undefined}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(lead)}>
          <p className="font-semibold leading-snug tracking-tight text-foreground">{lead.leadName}</p>
          {lead.company ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{lead.company}</span>
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                badgeClass
              )}
            >
              {PLATFORM_LABELS[platform] ?? platform}
            </span>
            {lead.country ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {lead.country}
              </span>
            ) : null}
          </div>
          {lead.email ? (
            <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0 text-primary/60" />
              <span className="truncate">{lead.email}</span>
            </p>
          ) : null}
          {next && lead.status !== "dead" && lead.status !== "client" ? (
            <p className="mt-2.5 inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-amber-500/15 via-orange-500/12 to-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-500/20 dark:text-amber-100">
              Follow-up {format(next, "MMM d")}
            </p>
          ) : null}
        </button>
      </div>
    </div>
  );
}

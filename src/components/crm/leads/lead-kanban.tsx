"use client";

import { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  closestCorners,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { LeadKanbanCard } from "./lead-card";
import type { CrmLead } from "@/contexts/crm-leads-context";
import { useCrmLeads } from "@/contexts/crm-leads-context";
import { useAuth } from "@/hooks/use-auth";
import { PIPELINE_STATUSES, STATUS_LABELS, type LeadStatus } from "@/lib/crm-lead-schema";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { KANBAN_COLUMN_ACCENTS } from "@/lib/crm-kanban-accents";
import { ChevronRight, LayoutGrid, Rows3 } from "lucide-react";

function KanbanColumn({
  status,
  leads,
  onOpenLead,
}: {
  status: LeadStatus;
  leads: CrmLead[];
  onOpenLead: (l: CrmLead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const accent = KANBAN_COLUMN_ACCENTS[status];
  const empty = leads.length === 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/column flex w-[min(100%,288px)] shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm backdrop-blur-[2px] transition-all duration-200",
        accent.tint,
        isOver && cn("scale-[1.01] shadow-lg ring-2 ring-offset-2 ring-offset-background", accent.dropHighlight)
      )}
    >
      <div className="relative border-b border-border/50 bg-gradient-to-b from-background/80 to-transparent px-3 pb-3 pt-2">
        <div
          className={cn(
            "mb-2.5 h-1 w-full rounded-full bg-gradient-to-r shadow-sm ring-1 ring-black/5 dark:ring-white/10",
            accent.bar
          )}
          aria-hidden
        />
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {STATUS_LABELS[status]}
          </h3>
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-background/90 px-2 text-sm font-bold tabular-nums text-foreground shadow-inner ring-1 ring-border/60">
            {leads.length}
          </span>
        </div>
      </div>
      <ScrollArea className="h-[min(70vh,640px)] px-2.5">
        <div
          className={cn(
            "flex flex-col gap-2.5 py-3",
            empty && "min-h-[min(52vh,420px)]"
          )}
        >
          {empty ? (
            <div
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/20 bg-background/50 px-3 py-10 text-center transition-colors",
                "group-hover/column:border-muted-foreground/30"
              )}
            >
              <div className="rounded-full bg-muted/80 p-3 ring-1 ring-border/50">
                <LayoutGrid className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-xs font-semibold text-muted-foreground">No leads here</p>
              <p className="max-w-[9rem] text-[10px] leading-relaxed text-muted-foreground/75">
                Drag a card from another column or use Quick add
              </p>
            </div>
          ) : (
            leads.map((l) => <LeadKanbanCard key={l.id} lead={l} onOpen={onOpenLead} />)
          )}
        </div>
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  );
}

type Props = {
  leads: CrmLead[];
  onOpenLead: (l: CrmLead) => void;
};

export function LeadKanban({ leads, onOpenLead }: Props) {
  const { user } = useAuth();
  const { updateLeadStatus } = useCrmLeads();
  const [active, setActive] = useState<CrmLead | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const byStatus = useCallback(
    (s: LeadStatus) => leads.filter((l) => l.status === s),
    [leads]
  );

  const onDragStart = useCallback((e: DragStartEvent) => {
    const id = String(e.active.id);
    const l = leads.find((x) => x.id === id);
    setActive(l ?? null);
  }, [leads]);

  const onDragEnd = useCallback(
    async (e: DragEndEvent) => {
      setActive(null);
      const { active: a, over } = e;
      if (!over || !user?.uid) return;
      const leadId = String(a.id);
      const overId = String(over.id) as LeadStatus;
      if (!PIPELINE_STATUSES.includes(overId)) return;
      const lead = leads.find((l) => l.id === leadId);
      if (!lead || lead.status === overId) return;
      try {
        await updateLeadStatus(leadId, overId, user.uid);
      } catch (err) {
        console.error(err);
      }
    },
    [leads, updateLeadStatus, user?.uid]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border/60 bg-gradient-to-br from-card/90 via-card/50 to-primary/[0.03] p-4 shadow-sm ring-1 ring-black/[0.03] dark:from-card/80 dark:to-primary/[0.06] dark:ring-white/[0.05] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner ring-1 ring-primary/15">
            <Rows3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight text-foreground">Pipeline board</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground/80">{leads.length}</span>{" "}
              {leads.length === 1 ? "lead" : "leads"} in view · drag cards to change stage
            </p>
          </div>
        </div>
        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground sm:justify-end">
          <span className="hidden sm:inline">Scroll for more stages</span>
          <span className="sm:hidden">Swipe horizontally</span>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
          <ChevronRight className="-ml-2 h-3.5 w-3.5 opacity-40" aria-hidden />
        </p>
      </div>

      {/* Native horizontal scroll: keeps overflow inside main so the sidebar does not pan with the board */}
      <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch]">
        <div className="flex w-max gap-4 pb-2 pr-1 pt-0.5">
          {PIPELINE_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              leads={byStatus(status)}
              onOpenLead={onOpenLead}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? <LeadKanbanCard lead={active} onOpen={() => {}} isDragging isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

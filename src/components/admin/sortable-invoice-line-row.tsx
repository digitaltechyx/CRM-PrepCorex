"use client";

import type { ReactNode, CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sortable invoice line wrapper. Drag only via the grip handle so inputs stay usable.
 */
export function SortableInvoiceLineRow({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: Boolean(disabled),
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-1",
        className,
        isDragging && "rounded-md bg-amber-50/90 shadow-md opacity-95"
      )}
    >
      {!disabled ? (
        <button
          type="button"
          className="mt-2 flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded text-amber-700/80 hover:bg-amber-100 hover:text-amber-900 active:cursor-grabbing md:mt-1"
          title="Drag to reorder"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

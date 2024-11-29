"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface DraggableCardProps {
  id: string;
  children: React.ReactNode;
}

export function DraggableCard({ id, children }: DraggableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative rounded-lg border bg-card">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 h-full w-8 flex items-center justify-center cursor-move hover:bg-accent/50 rounded-l-lg"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="pl-8">
        {children}
      </div>
    </div>
  );
}
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";

interface DraggableCardProps {
  id: string;
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  showDeleteButton?: boolean;
}

export function DraggableCard({ id, children, onDelete, showDeleteButton = true }: DraggableCardProps) {
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
    <div ref={setNodeRef} style={style} className="relative rounded-lg border bg-card group">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 h-full w-8 flex items-center justify-center cursor-move hover:bg-accent/50 rounded-l-lg"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="absolute -right-3 -top-3">
        {showDeleteButton && (
          <button onClick={onDelete} title="Delete" className="flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white hover:bg-red-800 shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="pl-8">
        {children}
      </div>
    </div>
  );
}
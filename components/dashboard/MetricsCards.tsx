"use client";

import { Transaction, CategoryTotal } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingDown, TrendingUp, CreditCard, Receipt, CalendarDays, FolderTree, Store } from "lucide-react";
import { DraggableCard } from "./DraggableCard";
import { DndContext, closestCenter, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, rectSortingStrategy } from "@dnd-kit/sortable";
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { useState } from "react";

interface MetricsCardsProps {
  transactions: Transaction[];
  categories: CategoryTotal[];
}

interface MetricCard {
  id: string;
  title: string;
  icon: React.ReactNode;
  value: string;
  subValue?: string;
}

export function MetricsCards({ transactions, categories }: MetricsCardsProps) {
  const totalSpent = transactions.length > 0 
    ? transactions.reduce((sum, t) => sum + t.amount, 0)
    : 0;

  const avgTransaction = transactions.length > 0 
    ? totalSpent / transactions.length 
    : 0;

  const maxCategory = categories.length > 0
    ? categories.reduce((prev, current) => prev.total > current.total ? prev : current)
    : { category: 'No Data', total: 0 };

  const lastTransaction = transactions.length > 0
    ? transactions[transactions.length - 1]
    : { amount: 0, vendor: 'No transactions' };

  const initialMetrics: MetricCard[] = [
    {
      id: "total-spent",
      title: "Total Spent",
      icon: <DollarSign className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
      value: `$${totalSpent.toFixed(2)}`,
    },
    {
      id: "avg-transaction",
      title: "Avg Transaction",
      icon: <TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
      value: `$${avgTransaction.toFixed(2)}`,
    },
    {
      id: "highest-category",
      title: "Highest Category",
      icon: <TrendingDown className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
      value: maxCategory.category,
      subValue: `$${maxCategory.total.toFixed(2)}`,
    },
    {
      id: "last-transaction",
      title: "Last Transaction",
      icon: <CreditCard className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
      value: `$${lastTransaction.amount.toFixed(2)}`,
      subValue: lastTransaction.vendor,
    },
    {
      id: "total-transactions",
      title: "Total Transactions",
      icon: <Receipt className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
      value: transactions.length.toString(),
    },
    {
      id: "daily-average",
      title: "Daily Average",
      icon: <CalendarDays className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
      value: `$${(totalSpent / 30).toFixed(2)}`,
      subValue: "Last 30 days",
    },
    {
      id: "unique-categories",
      title: "Categories Used",
      icon: <FolderTree className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
      value: categories.length.toString(),
    },
    {
      id: "unique-vendors",
      title: "Unique Vendors",
      icon: <Store className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
      value: Array.from(new Set(transactions.map(t => t.vendor))).length.toString(),
    }
  ];

  const [metrics, setMetrics] = useState<MetricCard[]>(initialMetrics);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setMetrics((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter} 
      onDragEnd={handleDragEnd}
      modifiers={[restrictToWindowEdges]}
    >
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <SortableContext 
          items={metrics.map(m => m.id)} 
          strategy={rectSortingStrategy}
        >
          {metrics.map((metric) => (
            <DraggableCard key={metric.id} id={metric.id}>
              <Card className="border-0 shadow-none">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
                  {metric.icon}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metric.value}</div>
                  {metric.subValue && (
                    <p className="text-xs text-muted-foreground">{metric.subValue}</p>
                  )}
                </CardContent>
              </Card>
            </DraggableCard>
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}
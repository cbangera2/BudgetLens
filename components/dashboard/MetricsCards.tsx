"use client";

import React from "react";
import { Transaction, CategoryTotal } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  DollarSign, 
  TrendingDown, 
  TrendingUp, 
  CreditCard, 
  Receipt, 
  CalendarDays, 
  FolderTree, 
  Store, 
  Plus, 
  Pencil, 
  Trash2, 
  Edit 
} from "lucide-react";
import { DraggableCard } from "./DraggableCard";
import { 
  DndContext, 
  closestCenter, 
  DragEndEvent, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors 
} from "@dnd-kit/core";
import { 
  SortableContext, 
  arrayMove, 
  sortableKeyboardCoordinates, 
  rectSortingStrategy 
} from "@dnd-kit/sortable";
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter,
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue, 
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface MetricsCardsProps {
  transactions: Transaction[];
  categories: CategoryTotal[];
}

interface MetricCard {
  id: string;
  title: string;
  icon: IconType;
  value: string;
  subValue?: string;
  backgroundColor?: string;
  calculation?: (transactions: Transaction[], categories: CategoryTotal[]) => { value: string; subValue?: string };
}

interface IconMap {
  [key: string]: React.ComponentType<any>;
}

const availableIcons: IconMap = {
  DollarSign: DollarSign,
  TrendingUp: TrendingUp,
  TrendingDown: TrendingDown,
  CreditCard: CreditCard,
  Receipt: Receipt,
  CalendarDays: CalendarDays,
  FolderTree: FolderTree,
  Store: Store,
  Plus: Plus,
  Pencil: Pencil,
  Trash2: Trash2,
  Edit: Edit
};

type IconType = keyof typeof availableIcons;

const CARD_COLORS = {
  "Default": {
    bg: "bg-background hover:bg-accent/20",
    indicator: "bg-background border-2 border-muted-foreground/20",
  },
  "Blue": {
    bg: "bg-blue-100/90 hover:bg-blue-200 dark:bg-blue-900/90 dark:hover:bg-blue-800",
    indicator: "bg-blue-500",
  },
  "Green": {
    bg: "bg-green-100/90 hover:bg-green-200 dark:bg-green-900/90 dark:hover:bg-green-800",
    indicator: "bg-green-500",
  },
  "Purple": {
    bg: "bg-purple-100/90 hover:bg-purple-200 dark:bg-purple-900/90 dark:hover:bg-purple-800",
    indicator: "bg-purple-500",
  },
  "Yellow": {
    bg: "bg-yellow-100/90 hover:bg-yellow-200 dark:bg-yellow-900/90 dark:hover:bg-yellow-800",
    indicator: "bg-yellow-500",
  },
  "Red": {
    bg: "bg-red-100/90 hover:bg-red-200 dark:bg-red-900/90 dark:hover:bg-red-800",
    indicator: "bg-red-500",
  },
} as const;

type CardColor = keyof typeof CARD_COLORS;

function MetricCardDialog({ 
  open, 
  onOpenChange, 
  onSave, 
  editingCard 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  onSave: (card: Partial<MetricCard>) => void;
  editingCard?: MetricCard;
}) {
  const [title, setTitle] = useState(editingCard?.title || "");
  const [selectedIcon, setSelectedIcon] = useState<IconType>("DollarSign");
  const [selectedColor, setSelectedColor] = useState<CardColor>("Default");

  useEffect(() => {
    if (editingCard) {
      setTitle(editingCard.title);
      const iconName = editingCard.icon;
      if (iconName && availableIcons[iconName]) {
        setSelectedIcon(iconName);
      }
      // Find the color key by value
      const colorKey = Object.entries(CARD_COLORS).find(
        ([_, value]) => value.bg === editingCard.backgroundColor
      )?.[0] as CardColor;
      setSelectedColor(colorKey || "Default");
    } else {
      setTitle("");
      setSelectedIcon("DollarSign");
      setSelectedColor("Default");
    }
  }, [editingCard]);

  const handleSave = () => {
    onSave({
      title,
      icon: selectedIcon,
      backgroundColor: CARD_COLORS[selectedColor].bg,
    });
    onOpenChange(false);
    setTitle("");
    setSelectedIcon("DollarSign");
    setSelectedColor("Default");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editingCard ? "Edit Metric Card" : "Add New Metric Card"}</DialogTitle>
          <DialogDescription>
            Customize your metric card here. Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="icon" className="text-right">
              Icon
            </Label>
            <Select
              value={selectedIcon as string}
              onValueChange={(value: IconType) => setSelectedIcon(value)}
              defaultValue="DollarSign"
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select an icon" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(availableIcons).map((iconName) => (
                  <SelectItem key={iconName} value={iconName}>
                    {iconName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              Color
            </Label>
            <div className="col-span-3 flex items-center gap-2">
              {Object.entries(CARD_COLORS).map(([colorName, { indicator }]) => (
                <button
                  key={colorName}
                  onClick={() => setSelectedColor(colorName as CardColor)}
                  className={cn(
                    "h-6 w-6 rounded-full transition-all",
                    indicator,
                    selectedColor === colorName 
                      ? "ring-2 ring-offset-2 ring-ring" 
                      : "hover:scale-110"
                  )}
                  type="button"
                  title={colorName}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MetricsCards({ transactions, categories }: MetricsCardsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<MetricCard | undefined>();
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const getDefaultMetrics = (): MetricCard[] => [
    {
      id: "total-spent",
      title: "Total Spent",
      icon: "DollarSign",
      value: "$0.00",
      calculation: (t) => {
        const total = t.reduce((sum, tx) => sum + tx.amount, 0);
        return { value: `$${total.toFixed(2)}` };
      },
    },
    {
      id: "avg-transaction",
      title: "Avg Transaction",
      icon: "TrendingUp",
      value: "$0.00",
      calculation: (t) => {
        const avg = t.length > 0 ? t.reduce((sum, tx) => sum + tx.amount, 0) / t.length : 0;
        return { value: `$${avg.toFixed(2)}` };
      },
    },
    {
      id: "highest-category",
      title: "Highest Category",
      icon: "TrendingDown",
      value: "No Data",
      subValue: "$0.00",
      calculation: (t, c) => {
        if (c.length === 0) return { value: "No Data", subValue: "$0.00" };
        const maxCategory = c.reduce((prev, current) => prev.total > current.total ? prev : current);
        return {
          value: maxCategory.category,
          subValue: `$${maxCategory.total.toFixed(2)}`,
        };
      },
    },
    {
      id: "last-transaction",
      title: "Last Transaction",
      icon: "CreditCard",
      value: "$0.00",
      subValue: "No transactions",
      calculation: (t) => {
        if (t.length === 0) return { value: "$0.00", subValue: "No transactions" };
        const lastTransaction = t[t.length - 1];
        return {
          value: `$${lastTransaction.amount.toFixed(2)}`,
          subValue: lastTransaction.vendor,
        };
      },
    },
    {
      id: "daily-average",
      title: "Daily Average",
      icon: "CalendarDays",
      value: "$0.00",
      subValue: "Last 30 days",
      calculation: (t) => {
        const total = t.reduce((sum, tx) => sum + tx.amount, 0);
        const dailyAvg = total / 30;
        return {
          value: `$${dailyAvg.toFixed(2)}`,
          subValue: "Last 30 days",
        };
      },
    },
    {
      id: "total-transactions",
      title: "Total Transactions",
      icon: "Receipt",
      value: "0",
      calculation: (t) => ({
        value: t.length.toString(),
      }),
    },
    {
      id: "unique-categories",
      title: "Categories Used",
      icon: "FolderTree",
      value: "0",
      calculation: (t, c) => ({
        value: c.length.toString(),
      }),
    },
    {
      id: "unique-vendors",
      title: "Unique Vendors",
      icon: "Store",
      value: "0",
      calculation: (t) => ({
        value: Array.from(new Set(t.map(tx => tx.vendor))).length.toString(),
      }),
    }
  ];

  const [metrics, setMetrics] = useState<MetricCard[]>(getDefaultMetrics());

  // Update metric values when transactions or categories change
  useEffect(() => {
    setMetrics(currentMetrics => 
      currentMetrics.map(metric => {
        if (metric.calculation) {
          const result = metric.calculation(transactions, categories);
          return { ...metric, ...result };
        }
        return metric;
      })
    );
  }, [transactions, categories]);

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

  const handleDeleteCard = (id: string) => {
    setMetrics((prev) => prev.filter((card) => card.id !== id));
  };

  const handleEditCard = (card: MetricCard) => {
    setEditingCard(card);
    setDialogOpen(true);
  };

  const handleSaveCard = (cardData: Partial<MetricCard>) => {
    if (editingCard) {
      // Edit existing card
      setMetrics((prev) =>
        prev.map((card) =>
          card.id === editingCard.id
            ? { 
                ...card, 
                title: cardData.title || card.title,
                icon: cardData.icon || card.icon,
                backgroundColor: cardData.backgroundColor || card.backgroundColor
              }
            : card
        )
      );
      setEditingCard(undefined);
    } else {
      // Add new card
      const newCard: MetricCard = {
        id: `custom-${Date.now()}`,
        title: cardData.title || "New Metric",
        icon: cardData.icon || "DollarSign",
        value: "Custom Value",
        backgroundColor: cardData.backgroundColor || "bg-card",
      };
      setMetrics((prev) => [...prev, newCard]);
    }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => {
            setEditingCard(undefined);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Metric
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter} 
          onDragEnd={handleDragEnd}
          modifiers={[restrictToWindowEdges]}
        >
          <SortableContext 
            items={metrics.map(metric => metric.id)} 
            strategy={rectSortingStrategy}
          >
            {metrics.map((metric) => (
              <DraggableCard key={metric.id} id={metric.id} showDeleteButton={false}>
                <Card className={cn(
                  "relative h-[120px] border transition-colors duration-200 group",
                  metric.backgroundColor || CARD_COLORS["Default"].bg
                )}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {metric.title}
                    </CardTitle>
                    <div className="flex space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          setEditingCard(metric);
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteCard(metric.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">{metric.value}</div>
                      {metric.subValue && (
                        <p className="text-xs text-muted-foreground">{metric.subValue}</p>
                      )}
                    </div>
                    {metric.icon && (
                      <div className="h-8 w-8 text-muted-foreground">
                        {React.createElement(availableIcons[metric.icon], {
                          className: "h-8 w-8",
                          strokeWidth: 1.5
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </DraggableCard>
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <MetricCardDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSaveCard}
        editingCard={editingCard}
      />
    </>
  );
}
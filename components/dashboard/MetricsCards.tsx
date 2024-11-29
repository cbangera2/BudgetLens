"use client";

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
  Trash2 
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
  Trash2: Trash2
};

type IconType = keyof typeof availableIcons;

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

  useEffect(() => {
    if (editingCard) {
      setTitle(editingCard.title);
      const iconName = editingCard.icon?.type?.name as IconType;
      if (iconName && availableIcons[iconName]) {
        setSelectedIcon(iconName);
      }
    } else {
      setTitle("");
      setSelectedIcon("DollarSign");
    }
  }, [editingCard]);

  const handleSave = () => {
    const Icon = availableIcons[selectedIcon];
    onSave({
      title,
      icon: <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
    });
    onOpenChange(false);
    setTitle("");
    setSelectedIcon("DollarSign");
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
              value={selectedIcon}
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
      icon: <DollarSign className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
      value: "$0.00",
      calculation: (t) => {
        const total = t.reduce((sum, tx) => sum + tx.amount, 0);
        return { value: `$${total.toFixed(2)}` };
      },
    },
    {
      id: "avg-transaction",
      title: "Avg Transaction",
      icon: <TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
      value: "$0.00",
      calculation: (t) => {
        const avg = t.length > 0 ? t.reduce((sum, tx) => sum + tx.amount, 0) / t.length : 0;
        return { value: `$${avg.toFixed(2)}` };
      },
    },
    {
      id: "highest-category",
      title: "Highest Category",
      icon: <TrendingDown className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
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
      icon: <CreditCard className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
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
      icon: <CalendarDays className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
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
      icon: <Receipt className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
      value: "0",
      calculation: (t) => ({
        value: t.length.toString(),
      }),
    },
    {
      id: "unique-categories",
      title: "Categories Used",
      icon: <FolderTree className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
      value: "0",
      calculation: (t, c) => ({
        value: c.length.toString(),
      }),
    },
    {
      id: "unique-vendors",
      title: "Unique Vendors",
      icon: <Store className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
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
                icon: cardData.icon || card.icon
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
        icon: cardData.icon || <DollarSign className="h-4 w-4 text-muted-foreground" strokeWidth={2} />,
        value: "Custom Value",
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
              <DraggableCard key={metric.id} id={metric.id} showDeleteButton={false}>
                <Card className="border-0 shadow-none group">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleEditCard(metric)}
                        data-testid="edit-button"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteCard(metric.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {metric.icon}
                    </div>
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

      <MetricCardDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSaveCard}
        editingCard={editingCard}
      />
    </>
  );
}
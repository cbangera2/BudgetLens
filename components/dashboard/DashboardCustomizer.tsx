"use client";

import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface DashboardComponent {
  id: string;
  type: 'metrics' | 'filter' | 'dynamic-charts' | string;
  title: string;
  description: string;
}

const AVAILABLE_COMPONENTS: DashboardComponent[] = [
  {
    id: 'csv-upload',
    type: 'csv-upload',
    title: 'Import Transactions',
    description: 'Upload and import transaction data from CSV files'
  },
  {
    id: 'metrics',
    type: 'metrics',
    title: 'Metrics Cards',
    description: 'Display key financial metrics in card format'
  },
  {
    id: 'filter',
    type: 'filter',
    title: 'Filter Bar',
    description: 'Filter transactions by category, date, and type'
  },
  {
    id: 'dynamic-charts',
    type: 'dynamic-charts',
    title: 'Custom Charts',
    description: 'Create and customize your own charts'
  },
  {
    id: 'spending',
    type: 'spending',
    title: 'Spending Chart',
    description: 'Visualize spending patterns by category'
  },
  {
    id: 'pie',
    type: 'pie',
    title: 'Category Pie Chart',
    description: 'View expense distribution in a pie chart'
  },
  {
    id: 'total-metrics',
    type: 'total-metrics',
    title: 'Total Metrics Chart',
    description: 'Compare total income, expenses, and savings'
  },
  {
    id: 'monthly-trends',
    type: 'monthly-trends',
    title: 'Monthly Trends',
    description: 'Track financial trends over time'
  },
  {
    id: 'transactions',
    type: 'transactions',
    title: 'Transactions Table',
    description: 'View and manage all transactions'
  },
  {
    id: 'budget-goals',
    type: 'budget-goals',
    title: 'Budget Goals',
    description: 'Set and track budget goals by category'
  }
];

interface DashboardCustomizerProps {
  onAddComponent: (componentType: string) => void;
  activeComponents: string[];
}

export function DashboardCustomizer({ onAddComponent, activeComponents }: DashboardCustomizerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full mb-4">
          <Plus className="h-4 w-4 mr-2" />
          Add Dashboard Component
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Dashboard Component</DialogTitle>
          <DialogDescription>
            Choose a component to add to your dashboard.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[400px] pr-4">
          <div className="grid grid-cols-2 gap-4">
            {AVAILABLE_COMPONENTS.map((component) => {
              const isActive = activeComponents.includes(component.type);
              return (
                <Card
                  key={component.id}
                  className={`cursor-pointer transition-colors hover:bg-accent`}
                  onClick={() => {
                    onAddComponent(component.type);
                    setOpen(false);
                  }}
                >
                  <CardHeader>
                    <CardTitle className="text-lg">{component.title}</CardTitle>
                    <CardDescription>{component.description}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

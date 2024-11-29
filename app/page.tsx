"use client";

import { useEffect, useState } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { arrayMove, SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { Transaction, CategoryTotal, MonthlySpending } from "@/lib/types";
import { parseCSV, calculateCategoryTotals, calculateMonthlySpending } from "@/lib/utils/data";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { CategoryPieChart } from "@/components/dashboard/CategoryPieChart";
import { TransactionsTable } from "@/components/dashboard/TransactionsTable";
import { CSVUpload } from "@/components/dashboard/CSVUpload";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { DraggableCard } from "@/components/dashboard/DraggableCard";
import BudgetGoals from "@/components/dashboard/BudgetGoals";
import { SAMPLE_DATA, INITIAL_LAYOUT, RESET_FILTER_VALUE, INITIAL_BUDGET_GOALS } from "@/lib/utils/constants";

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([]);
  const [monthlySpending, setMonthlySpending] = useState<MonthlySpending[]>([]);
  const [layout, setLayout] = useState(INITIAL_LAYOUT);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<string[]>([]);
  const [budgetGoals, setBudgetGoals] = useState<{ categoryId: string; amount: number; }[]>(INITIAL_BUDGET_GOALS);
  const [budgetGoalSettings, setBudgetGoalSettings] = useState<{
    isYearlyView: boolean;
    showOverBudgetWarnings: boolean;
    showProgressBars: boolean;
  }>({
    isYearlyView: false,
    showOverBudgetWarnings: true,
    showProgressBars: true
  });

  useEffect(() => {
    const parsedTransactions = parseCSV(SAMPLE_DATA);
    setTransactions(parsedTransactions);
    setFilteredTransactions(parsedTransactions);
    setCategoryTotals(calculateCategoryTotals(parsedTransactions));
    setMonthlySpending(calculateMonthlySpending(parsedTransactions));
  }, []);

  useEffect(() => {
    let filtered = transactions;
    
    if (categoryFilter.length > 0) {
      filtered = filtered.filter(t => categoryFilter.includes(t.category));
    }
    if (vendorFilter.length > 0) {
      filtered = filtered.filter(t => vendorFilter.includes(t.vendor));
    }
    if (transactionTypeFilter.length > 0) {
      filtered = filtered.filter(t => transactionTypeFilter.includes(t.transactionType));
    }

    setFilteredTransactions(filtered);
    setCategoryTotals(calculateCategoryTotals(filtered));
    setMonthlySpending(calculateMonthlySpending(filtered));
  }, [transactions, categoryFilter, vendorFilter, transactionTypeFilter]);

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setLayout((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleCSVUpload = (content: string) => {
    const parsedTransactions = parseCSV(content);
    setTransactions(parsedTransactions);
    setCategoryFilter([]);
    setVendorFilter([]);
    setTransactionTypeFilter([]);
  };

  const handleCategoryFilter = (includes: string[], excludes: string[]) => setCategoryFilter(includes);
  const handleVendorFilter = (includes: string[], excludes: string[]) => setVendorFilter(includes);
  const handleTransactionTypeFilter = (includes: string[], excludes: string[]) => setTransactionTypeFilter(includes);

  const renderSection = (id: string, index: number) => {
    switch (id) {
      case "metrics":
        return (
          <DraggableCard key={`${id}-${index}`} id={id}>
            <MetricsCards transactions={filteredTransactions} categories={categoryTotals} />
          </DraggableCard>
        );
      case "monthly":
        return (
          <DraggableCard key={`${id}-${index}`} id={id}>
            <SpendingChart monthlySpending={monthlySpending} />
          </DraggableCard>
        );
      case "categories":
        return (
          <DraggableCard key={`${id}-${index}`} id={id}>
            <CategoryPieChart categories={categoryTotals} />
          </DraggableCard>
        );
      case "transactions":
        return (
          <DraggableCard key={`${id}-${index}`} id={id}>
            <div className="p-6">
              <h2 className="text-2xl font-semibold mb-4">Recent Transactions</h2>
              <TransactionsTable transactions={filteredTransactions} />
            </div>
          </DraggableCard>
        );
      case "budget-goals":
        return (
          <DraggableCard key={`${id}-${index}`} id={id}>
            <BudgetGoals 
              categories={categoryTotals} 
              initialGoals={budgetGoals}
              onSaveGoals={setBudgetGoals}
              settings={budgetGoalSettings}
              onSettingsChange={setBudgetGoalSettings}
            />
          </DraggableCard>
        );
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-4xl font-bold mb-8">BudgetLens Dashboard</h1>
      
      <div className="mb-8">
        <CSVUpload onUpload={handleCSVUpload} />
      </div>

      <FilterBar
        transactions={transactions}
        onCategoryFilter={handleCategoryFilter}
        onVendorFilter={handleVendorFilter}
        onTransactionTypeFilter={handleTransactionTypeFilter}
      />

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={layout} strategy={rectSortingStrategy}>
          <div className="space-y-8">
            {layout.map((id, index) => renderSection(id, index))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
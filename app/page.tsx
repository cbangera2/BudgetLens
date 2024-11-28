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
import { SAMPLE_DATA, INITIAL_LAYOUT, RESET_FILTER_VALUE } from "@/lib/utils/constants";

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([]);
  const [monthlySpending, setMonthlySpending] = useState<MonthlySpending[]>([]);
  const [layout, setLayout] = useState(INITIAL_LAYOUT);
  const [categoryFilter, setCategoryFilter] = useState(RESET_FILTER_VALUE);
  const [vendorFilter, setVendorFilter] = useState(RESET_FILTER_VALUE);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState(RESET_FILTER_VALUE);

  useEffect(() => {
    const parsedTransactions = parseCSV(SAMPLE_DATA);
    setTransactions(parsedTransactions);
    setFilteredTransactions(parsedTransactions);
    setCategoryTotals(calculateCategoryTotals(parsedTransactions));
    setMonthlySpending(calculateMonthlySpending(parsedTransactions));
  }, []);

  useEffect(() => {
    let filtered = transactions;
    
    if (categoryFilter !== RESET_FILTER_VALUE) {
      filtered = filtered.filter(t => t.category === categoryFilter);
    }
    if (vendorFilter !== RESET_FILTER_VALUE) {
      filtered = filtered.filter(t => t.vendor === vendorFilter);
    }
    if (transactionTypeFilter !== RESET_FILTER_VALUE) {
      filtered = filtered.filter(t => t.transactionType === transactionTypeFilter);
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
    setCategoryFilter(RESET_FILTER_VALUE);
    setVendorFilter(RESET_FILTER_VALUE);
    setTransactionTypeFilter(RESET_FILTER_VALUE);
  };

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
            <div className="rounded-lg border bg-card">
              <div className="p-6">
                <h2 className="text-2xl font-semibold mb-4">Recent Transactions</h2>
                <TransactionsTable transactions={filteredTransactions} />
              </div>
            </div>
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
        onCategoryFilter={setCategoryFilter}
        onVendorFilter={setVendorFilter}
        onTransactionTypeFilter={setTransactionTypeFilter}
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
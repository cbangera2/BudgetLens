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
import { TotalMetricsChart } from "@/components/dashboard/TotalMetricsChart";
import { MonthlyTrendsChart } from "@/components/dashboard/MonthlyTrendsChart";
import { DynamicCharts } from "@/components/dashboard/DynamicCharts";
import { DashboardCustomizer } from "@/components/dashboard/DashboardCustomizer";
import BudgetGoals from "@/components/dashboard/BudgetGoals";
import { SAMPLE_DATA, INITIAL_LAYOUT, RESET_FILTER_VALUE, INITIAL_BUDGET_GOALS } from "@/lib/utils/constants";
import { useTransactions } from "@/hooks/useTransactions";
import { AIProvider } from "@/context/AIContext";
import { AIChat } from "@/components/AIChat";

export default function Home() {
  const {
    transactions,
    loading,
    error,
    fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    importTransactions
  } = useTransactions();
  
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([]);
  const [monthlySpending, setMonthlySpending] = useState<MonthlySpending[]>([]);
  const [layout, setLayout] = useState(INITIAL_LAYOUT);
  const [activeComponents, setActiveComponents] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
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

  // Set filtered transactions whenever transactions or filters change
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
    if (startDate || endDate) {
      filtered = filtered.filter(t => {
        const transactionDate = new Date(t.date);
        if (startDate && endDate) {
          return transactionDate >= startDate && transactionDate <= endDate;
        } else if (startDate) {
          return transactionDate >= startDate;
        } else if (endDate) {
          return transactionDate <= endDate;
        }
        return true;
      });
    }

    setFilteredTransactions(filtered);
  }, [transactions, categoryFilter, vendorFilter, transactionTypeFilter, startDate, endDate]);

  // Calculate totals whenever filtered transactions change
  useEffect(() => {
    const totals = calculateCategoryTotals(filteredTransactions);
    setCategoryTotals(totals);
    const monthly = calculateMonthlySpending(filteredTransactions);
    setMonthlySpending(monthly);
  }, [filteredTransactions]);

  const handleAddComponent = (componentType: string) => {
    setActiveComponents(prev => [...prev, componentType]);
    setLayout(prev => [...prev, componentType]);
  };

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

  const handleCSVUpload = async (content: string) => {
    await importTransactions(content);
    setCategoryFilter([]);
    setVendorFilter([]);
    setTransactionTypeFilter([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  const handleAddTransaction = (newTransaction: Transaction) => {
    addTransaction(newTransaction);
  };

  const handleUpdateTransaction = (oldTransaction: Transaction, newTransaction: Transaction) => {
    updateTransaction(oldTransaction, newTransaction);
  };

  const handleDeleteTransaction = (transactionToDelete: Transaction) => {
    deleteTransaction(transactionToDelete);
  };

  const handleCategoryFilter = (includes: string[], excludes: string[]) => setCategoryFilter(includes);
  const handleVendorFilter = (includes: string[], excludes: string[]) => setVendorFilter(includes);
  const handleTransactionTypeFilter = (includes: string[], excludes: string[]) => setTransactionTypeFilter(includes);

  const handleEdit = (id: string) => {
    console.log(`Edit card with id: ${id}`);
    // Implement edit logic here
  };

  const handleDelete = (id: string) => {
    setLayout((prevLayout) => prevLayout.filter((cardId) => cardId !== id));
  };

  const renderComponent = (type: string) => {
    switch (type) {
      case 'metrics':
        return <MetricsCards transactions={filteredTransactions} categories={categoryTotals} />;
      case 'filter':
        return (
          <div className="mt-6">
            <FilterBar
              transactions={transactions}
              onCategoryFilter={(includes, excludes) => {
                setCategoryFilter(includes);
              }}
              onVendorFilter={(includes, excludes) => {
                setVendorFilter(includes);
              }}
              onTransactionTypeFilter={(includes, excludes) => {
                setTransactionTypeFilter(includes);
              }}
              onDateFilter={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
            />
          </div>
        );
      case 'dynamic-charts':
        return (
          <DynamicCharts
            data={filteredTransactions}
            availableMetrics={['expenses', 'income', 'savings']}
            formatValue={(value) => (typeof value === 'number' ? `$${value.toFixed(2)}` : '$0.00')}
            formatTooltip={(value) => (typeof value === 'number' ? `$${value.toFixed(2)}` : '$0.00')}
            formatAxisLabel={(value) => (typeof value === 'number' ? `$${(value / 1000).toFixed(1)}k` : '$0k')}
          />
        );
      case 'spending':
        return <SpendingChart transactions={filteredTransactions} />
      case 'categories':
        return <CategoryPieChart transactions={filteredTransactions} categoryTotals={categoryTotals} />;
      case 'total-metrics':
        return <TotalMetricsChart transactions={filteredTransactions} />;
      case 'monthly-trends':
        return <MonthlyTrendsChart transactions={filteredTransactions} chartType='line' />;
      case 'monthly':
        return <MonthlyTrendsChart transactions={filteredTransactions} chartType='bar-vertical' />;
      case 'transactions':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-semibold mb-4">Recent Transactions</h2>
            <TransactionsTable 
              transactions={filteredTransactions} 
              onAddTransaction={handleAddTransaction}
              onUpdateTransaction={handleUpdateTransaction}
              onDeleteTransaction={handleDeleteTransaction}
            />
          </div>
        );
      case 'budget-goals':
        return (
          <BudgetGoals 
            categories={categoryTotals} 
            initialGoals={budgetGoals}
            onSaveGoals={setBudgetGoals}
            settings={budgetGoalSettings}
            onSettingsChange={setBudgetGoalSettings}
          />
        );
      case 'csv-upload':
        return <CSVUpload onUpload={handleCSVUpload} />;
      default:
        return null;
    }
  };

  return (
    <main className="container mx-auto py-8">
      <h1 className="text-4xl font-bold mb-8">BudgetLens Dashboard</h1>

      <DashboardCustomizer
        onAddComponent={handleAddComponent}
        activeComponents={activeComponents}
      />

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={layout} strategy={rectSortingStrategy}>
          <div className="space-y-8">
            {layout.map((componentType) => (
              <DraggableCard key={componentType} id={componentType} onEdit={() => handleEdit(componentType)} onDelete={() => handleDelete(componentType)}>
                {renderComponent(componentType)}
              </DraggableCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <AIProvider>
        <AIChat />
      </AIProvider>
    </main>
  );
}
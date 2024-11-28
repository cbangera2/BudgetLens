"use client";

import { Transaction, CategoryTotal } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingDown, TrendingUp, CreditCard } from "lucide-react";

interface MetricsCardsProps {
  transactions: Transaction[];
  categories: CategoryTotal[];
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

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${totalSpent.toFixed(2)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Transaction</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${avgTransaction.toFixed(2)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Highest Category</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{maxCategory.category}</div>
          <p className="text-xs text-muted-foreground">
            ${maxCategory.total.toFixed(2)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Last Transaction</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${lastTransaction.amount.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground">{lastTransaction.vendor}</p>
        </CardContent>
      </Card>
    </div>
  );
}
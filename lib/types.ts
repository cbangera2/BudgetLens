export interface Transaction {
  date: string;
  vendor: string;
  amount: number;
  category: string;
  transactionType: string;
}

export interface CategoryTotal {
  category: string;
  total: number;
  percentage: number;
}

export interface MonthlySpending {
  month: string;
  total: number;
}

export type MetricType = 'expenses' | 'income' | 'savings';
import { Transaction, CategoryTotal, MonthlySpending } from '../types';

export const parseCSV = (csvContent: string): Transaction[] => {
  const lines = csvContent.trim().split('\n');
  const transactions = lines.slice(1).map(line => {
    const [date, vendor, amount, category, transactionType] = line.split(',').map(item => item.trim());
    return {
      date,
      vendor,
      amount: parseFloat(amount.replace(/[^\d.-]/g, '')),
      category,
      transactionType
    };
  });
  return transactions;
};

export const calculateCategoryTotals = (transactions: Transaction[]): CategoryTotal[] => {
  const categoryMap = new Map<string, number>();
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);

  transactions.forEach(t => {
    categoryMap.set(t.category, (categoryMap.get(t.category) || 0) + t.amount);
  });

  return Array.from(categoryMap.entries()).map(([category, amount]) => ({
    category,
    total: amount,
    percentage: (amount / total) * 100
  }));
};

export const calculateMonthlySpending = (transactions: Transaction[]): MonthlySpending[] => {
  const monthlyMap = new Map<string, number>();

  transactions.forEach(t => {
    const month = t.date.substring(0, 2);
    const year = t.date.substring(6, 10);
    const key = `${year}-${month}`;
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + t.amount);
  });

  return Array.from(monthlyMap.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month));
};
import { useState, useEffect } from 'react';
import type { Transaction } from '@prisma/client';

export const useTransactions = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = async (filters?: {
    category?: string[];
    vendor?: string[];
    transactionType?: string[];
    startDate?: Date;
    endDate?: Date;
  }) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (filters?.category?.length) params.append('category', filters.category.join(','));
      if (filters?.vendor?.length) params.append('vendor', filters.vendor.join(','));
      if (filters?.transactionType?.length) params.append('transactionType', filters.transactionType.join(','));
      if (filters?.startDate) params.append('startDate', filters.startDate.toISOString().split('T')[0]);
      if (filters?.endDate) params.append('endDate', filters.endDate.toISOString().split('T')[0]);
      
      const response = await fetch(`/api/transactions?${params}`);
      if (!response.ok) throw new Error('Failed to fetch transactions');
      
      const data = await response.json();
      setTransactions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction),
      });
      
      if (!response.ok) throw new Error('Failed to add transaction');
      
      const newTransaction = await response.json();
      setTransactions(prev => [...prev, newTransaction]);
      return newTransaction;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transaction');
      throw err;
    }
  };

  const updateTransaction = async (oldTransaction: Transaction, newTransaction: Partial<Transaction>) => {
    try {
      const response = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: oldTransaction.id, ...newTransaction }),
      });
      
      if (!response.ok) throw new Error('Failed to update transaction');
      
      const updatedTransaction = await response.json();
      setTransactions(prev =>
        prev.map(t => t.id === oldTransaction.id ? updatedTransaction : t)
      );
      return updatedTransaction;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update transaction');
      throw err;
    }
  };

  const deleteTransaction = async (transaction: Transaction) => {
    try {
      const response = await fetch(`/api/transactions?id=${transaction.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete transaction');
      
      setTransactions(prev => prev.filter(t => t.id !== transaction.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete transaction');
      throw err;
    }
  };

  const importTransactions = async (csvContent: string) => {
    try {
      const lines = csvContent.trim().split('\n');
      const transactions = lines.slice(1).map(line => {
        const [date, vendor, amount, category, transactionType] = line.split(',').map(item => item.trim());
        return {
          date,
          vendor,
          amount: parseFloat(amount.replace('$', '')),
          category,
          transactionType
        };
      });

      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transactions),
      });

      if (!response.ok) throw new Error('Failed to import transactions');

      await fetchTransactions(); // Refresh the transactions list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import transactions');
      throw err;
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  return {
    transactions,
    loading,
    error,
    fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    importTransactions,
  };
};

import { useState, useCallback } from "react";
import { Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { ChartSettings } from "./ChartSettings";
import { format } from "date-fns";

interface MonthlyTrendsChartProps {
  transactions: Transaction[];
}

export function MonthlyTrendsChart({ transactions }: MonthlyTrendsChartProps) {
  const [chartSettings, setChartSettings] = useState({
    valueDisplay: 'value' as const,
    gridType: 'both' as const,
    chartHeight: 300,
    colorScheme: 'default',
    labelPosition: 'outside' as const,
    animationDuration: 400
  });

  // Calculate monthly totals
  const monthlyData = transactions.reduce((acc, transaction) => {
    const date = new Date(transaction.date);
    const monthKey = format(date, 'MMM yyyy');
    const amount = transaction.amount;
    
    if (!acc[monthKey]) {
      acc[monthKey] = {
        month: monthKey,
        income: 0,
        expenses: 0,
        savings: 0
      };
    }
    
    if (transaction.transactionType === "income" || 
        transaction.transactionType === "Credit" || 
        transaction.transactionType === "credits") {
      acc[monthKey].income += amount;
    } else if (transaction.transactionType === "expense" || 
               transaction.transactionType === "Debit" || 
               transaction.transactionType === "debits") {
      acc[monthKey].expenses += amount;
    }
    
    acc[monthKey].savings = acc[monthKey].income - acc[monthKey].expenses;
    
    return acc;
  }, {} as Record<string, { month: string; income: number; expenses: number; savings: number; }>);

  const data = Object.values(monthlyData).sort((a, b) => 
    new Date(a.month).getTime() - new Date(b.month).getTime()
  );

  const handleSettingChange = useCallback((key: string, value: any) => {
    setChartSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const getColors = useCallback(() => {
    switch (chartSettings.colorScheme) {
      case 'monochrome':
        return ['#90caf9', '#42a5f5', '#1976d2'];
      case 'categorical':
        return ['#4caf50', '#f44336', '#2196f3'];
      case 'sequential':
        return ['#c8e6c9', '#66bb6a', '#2e7d32'];
      default:
        return ['#22c55e', '#ef4444', '#3b82f6'];
    }
  }, [chartSettings.colorScheme]);

  const formatValue = useCallback((value: number) => {
    const parts = [];
    if (['value', 'both'].includes(chartSettings.valueDisplay)) {
      parts.push(new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value));
    }
    if (['percentage', 'both'].includes(chartSettings.valueDisplay)) {
      const totalIncome = data.reduce((sum, item) => sum + Math.abs(item.income), 0);
      const percentage = (Math.abs(value) / totalIncome * 100).toFixed(1);
      parts.push(`${percentage}%`);
    }
    return parts.join(' / ') || '0';
  }, [chartSettings.valueDisplay, data]);

  const colors = getColors();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Monthly Financial Trends</CardTitle>
        <ChartSettings
          settings={chartSettings}
          onSettingChange={handleSettingChange}
          type="bar"
        />
      </CardHeader>
      <CardContent>
        <div style={{ height: `${chartSettings.chartHeight}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ left: 60, right: 20, top: 20, bottom: 20 }}
              animationDuration={chartSettings.animationDuration}
            >
              {chartSettings.gridType !== 'none' && (
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={chartSettings.gridType !== 'vertical'}
                  vertical={chartSettings.gridType !== 'horizontal'}
                />
              )}
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => 
                  chartSettings.valueDisplay !== 'percentage' 
                    ? `$${(value / 1000).toFixed(1)}k`
                    : `${value}%`
                }
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatValue(value),
                  name.charAt(0).toUpperCase() + name.slice(1)
                ]}
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="income"
                stroke={colors[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                name="Income"
              />
              <Line
                type="monotone"
                dataKey="expenses"
                stroke={colors[1]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                name="Expenses"
              />
              <Line
                type="monotone"
                dataKey="savings"
                stroke={colors[2]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                name="Savings"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

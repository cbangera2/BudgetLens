import { Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { useState } from "react";
import { ChartSettings } from "./ChartSettings";

interface TotalMetricsChartProps {
  transactions: Transaction[];
}

export function TotalMetricsChart({ transactions }: TotalMetricsChartProps) {
  const [chartSettings, setChartSettings] = useState({
    valueDisplay: 'value' as const,
    gridType: 'horizontal' as const,
    chartHeight: 300,
    colorScheme: 'default',
    labelPosition: 'outside' as const,
    animationDuration: 400,
  });

  // Calculate totals
  const totals = transactions.reduce(
    (acc, transaction) => {
      const amount = transaction.amount;
      if (transaction.transactionType === "income" || transaction.transactionType === "Credit" || transaction.transactionType === "credits") {
        acc.income += amount;
      } else if (transaction.transactionType === "expense" || transaction.transactionType === "Debit" || transaction.transactionType === "debits") {
        acc.expenses += amount;
      }
      return acc;
    },
    { income: 0, expenses: 0 }
  );

  // Calculate savings (income - expenses)
  const savings = totals.income - totals.expenses;

  // Prepare data for the chart
  const data = [
    {
      name: "Total Metrics",
      Income: totals.income,
      Expenses: totals.expenses,
      Savings: savings,
    },
  ];

  // Get colors based on color scheme
  const getColors = () => {
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
  };
  
  const colors = getColors();

  const handleSettingChange = (
    key: keyof typeof chartSettings,
    value: string | number
  ) => {
    setChartSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const formatValue = (value: number) => {
    if (chartSettings.valueDisplay === 'none') return '';
    if (chartSettings.valueDisplay === 'percentage') {
      const total = Math.abs(totals.income) + Math.abs(totals.expenses) + Math.abs(savings);
      return `${((value / total) * 100).toFixed(1)}%`;
    }
    if (chartSettings.valueDisplay === 'both') {
      const total = Math.abs(totals.income) + Math.abs(totals.expenses) + Math.abs(savings);
      return `${new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value)} (${((value / total) * 100).toFixed(1)}%)`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>Total Income, Expenses & Savings</CardTitle>
        <ChartSettings
          settings={chartSettings}
          onSettingChange={handleSettingChange}
          type="bar"
        />
      </CardHeader>
      <CardContent>
        <div style={{ height: `${chartSettings.chartHeight}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} animationDuration={chartSettings.animationDuration}>
              <XAxis dataKey="name" />
              <YAxis />
              {chartSettings.gridType !== 'none' && (
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={chartSettings.gridType !== 'vertical'}
                  vertical={chartSettings.gridType !== 'horizontal'}
                />
              )}
              <Tooltip
                formatter={(value: number) => formatValue(value)}
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                }}
              />
              <Legend />
              <Bar
                dataKey="Income"
                fill={colors[0]}
                radius={[4, 4, 0, 0]}
                label={chartSettings.labelPosition !== 'none' ? {
                  position: chartSettings.labelPosition,
                  formatter: (value: number) => formatValue(value),
                } : false}
              />
              <Bar
                dataKey="Expenses"
                fill={colors[1]}
                radius={[4, 4, 0, 0]}
                label={chartSettings.labelPosition !== 'none' ? {
                  position: chartSettings.labelPosition,
                  formatter: (value: number) => formatValue(value),
                } : false}
              />
              <Bar
                dataKey="Savings"
                fill={colors[2]}
                radius={[4, 4, 0, 0]}
                label={chartSettings.labelPosition !== 'none' ? {
                  position: chartSettings.labelPosition,
                  formatter: (value: number) => formatValue(value),
                } : false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div className="flex flex-col items-center">
            <span className="text-green-500 font-semibold">
              {formatValue(totals.income)}
            </span>
            <span className="text-muted-foreground">Income</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-red-500 font-semibold">
              {formatValue(totals.expenses)}
            </span>
            <span className="text-muted-foreground">Expenses</span>
          </div>
          <div className="flex flex-col items-center">
            <span className={`font-semibold ${savings >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
              {formatValue(savings)}
            </span>
            <span className="text-muted-foreground">Savings</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

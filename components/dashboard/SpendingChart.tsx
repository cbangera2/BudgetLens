"use client";

import { useState, useCallback } from "react";
import { Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer } from "recharts";
import { ChartSettings, ChartSettingsProps } from "./ChartSettings";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { GenericChart } from "./GenericChart";
import { isCreditTransaction } from "@/lib/utils/transactionUtils";

interface SpendingChartProps {
  transactions: Transaction[];
}

type MetricType = 'expenses' | 'income' | 'savings';

interface CategoryMetrics {
  name: string;
  expenses: number;
  income: number;
  savings: number;
}

export function SpendingChart({ transactions }: SpendingChartProps) {
  const [chartSettings, setChartSettings] = useState<ChartSettingsProps['settings']>({
    valueDisplay: 'value',
    gridType: 'both',
    chartHeight: 300,
    legendPosition: 'bottom',
    animationDuration: 400,
    chartType: 'bar-vertical'
  });

  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(['expenses']);

  // Calculate category metrics
  const categoryMetrics = transactions.reduce((acc: Record<string, CategoryMetrics>, transaction) => {
    const category = transaction.category || 'Uncategorized';
    const amount = transaction.amount;
    
    if (!acc[category]) {
      acc[category] = {
        name: category,
        expenses: 0,
        income: 0,
        savings: 0
      };
    }
    
    if (isCreditTransaction(transaction)) {
      acc[category].income += amount;
    } else {
      acc[category].expenses += amount;
    }
    
    return acc;
  }, {});

  // Calculate savings for each category
  Object.values(categoryMetrics).forEach(metrics => {
    metrics.savings = metrics.income - metrics.expenses;
  });

  // Convert to array and sort by total amount
  const data = Object.entries(categoryMetrics)
    .map(([category, metrics]) => ({
      ...metrics
    }))
    .sort((a, b) => {
      const totalA = selectedMetrics.reduce((sum, metric) => sum + Math.abs(a[metric]), 0);
      const totalB = selectedMetrics.reduce((sum, metric) => sum + Math.abs(b[metric]), 0);
      return totalB - totalA;
    })
    // Take top 7 categories and group the rest as "Other"
    .reduce((acc, entry, index) => {
      if (index < 7) {
        acc.push(entry);
      } else if (acc.length === 7) {
        acc.push({
          name: 'Other',
          expenses: entry.expenses,
          income: entry.income,
          savings: entry.savings
        });
      } else {
        acc[7].expenses += entry.expenses;
        acc[7].income += entry.income;
        acc[7].savings += entry.savings;
      }
      return acc;
    }, [] as CategoryMetrics[]);

  const handleSettingChange = useCallback((key: string, value: any) => {
    setChartSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleMetricToggle = (metric: MetricType) => {
    setSelectedMetrics(prev => {
      if (prev.includes(metric)) {
        return prev.filter(m => m !== metric);
      }
      return [...prev, metric];
    });
  };

  const colors = [
    '#dc2626', // red for expenses
    '#16a34a', // green for income
    '#2563eb'  // blue for savings
  ];

  const formatValue = (value: number) => {
    if (chartSettings.valueDisplay === 'percentage') {
      const total = data.reduce((sum, category) => 
        sum + selectedMetrics.reduce((metricSum, metric) => metricSum + Math.abs(category[metric]), 0), 0);
      return `${((value / total) * 100).toFixed(1)}%`;
    }
    return `$${value.toFixed(2)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Spending by Category</span>
          <div className="flex items-center space-x-4">
            {(['expenses', 'income', 'savings'] as MetricType[]).map((metric, index) => (
              <div key={metric} className="flex items-center space-x-2">
                <Checkbox
                  id={`metric-${metric}`}
                  checked={selectedMetrics.includes(metric)}
                  onCheckedChange={() => handleMetricToggle(metric)}
                />
                <Label
                  htmlFor={`metric-${metric}`}
                  className="text-sm capitalize"
                  style={{ color: colors[index] }}
                >
                  {metric}
                </Label>
              </div>
            ))}
          </div>
          <ChartSettings
            settings={chartSettings}
            onSettingChange={handleSettingChange}
            type="bar"
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${chartSettings.chartHeight}px` }}>
          <GenericChart
            data={data}
            settings={chartSettings}
            selectedMetrics={selectedMetrics}
            colors={colors}
            formatValue={formatValue}
            formatTooltip={formatValue}
          />
        </div>
      </CardContent>
    </Card>
  );
}
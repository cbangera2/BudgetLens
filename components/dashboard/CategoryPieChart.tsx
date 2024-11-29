"use client";

import { useState, useCallback } from "react";
import { CategoryTotal, Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GenericChart } from "./GenericChart";
import { ChartSettings } from "./ChartSettings";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { isCreditTransaction } from "@/lib/utils/transactionUtils";

interface CategoryPieChartProps {
  categoryTotals: CategoryTotal[];
  transactions: Transaction[];
}

type MetricType = 'expenses' | 'income';

interface CategoryMetrics {
  name: string;
  expenses: number;
  income: number;
}

export function CategoryPieChart({ categoryTotals, transactions }: CategoryPieChartProps) {
  const [chartSettings, setChartSettings] = useState({
    valueDisplay: 'value',
    chartHeight: 300,
    legendPosition: 'right',
    labelPosition: 'outside',
    animationDuration: 400,
    chartType: 'pie'
  });

  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(['expenses']);

  // Calculate category metrics
  const categoryMetrics = transactions.reduce((acc, transaction) => {
    const category = transaction.category || 'Uncategorized';
    const amount = transaction.amount;
    
    if (!acc[category]) {
      acc[category] = {
        name: category,
        income: 0,
        expenses: 0
      };
    }
    
    if (isCreditTransaction(transaction)) {
      acc[category].income += amount;
    } else {
      acc[category].expenses += amount;
    }
    
    return acc;
  }, {} as Record<string, CategoryMetrics>);

  const data = Object.values(categoryMetrics)
    .map(metric => ({
      name: metric.name,
      expenses: metric.expenses,
      income: metric.income
    }))
    .filter(metric => selectedMetrics.some(type => metric[type] > 0))
    .sort((a, b) => {
      const totalA = selectedMetrics.reduce((sum, type) => sum + Math.abs(a[type]), 0);
      const totalB = selectedMetrics.reduce((sum, type) => sum + Math.abs(b[type]), 0);
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
          income: entry.income
        });
      } else {
        acc[7].expenses += entry.expenses;
        acc[7].income += entry.income;
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
    '#dc2626', // red
    '#f97316', // orange
    '#f59e0b', // amber
    '#84cc16', // lime
    '#22c55e', // green
    '#14b8a6', // teal
    '#0ea5e9', // sky
    '#6366f1', // indigo
  ];

  const metricColors = {
    expenses: '#dc2626', // red for expenses
    income: '#16a34a', // green for income
  };

  const formatValue = useCallback((value: number) => {
    if (chartSettings.valueDisplay === 'percentage') {
      const total = data.reduce((sum, category) => 
        sum + selectedMetrics.reduce((metricSum, metric) => metricSum + Math.abs(category[metric]), 0), 0);
      return `${((value / total) * 100).toFixed(1)}%`;
    }
    return `$${value.toFixed(2)}`;
  }, [chartSettings.valueDisplay, data, selectedMetrics]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Category Distribution</span>
          <div className="flex items-center space-x-4">
            {(['expenses', 'income'] as MetricType[]).map((metric, index) => (
              <div key={metric} className="flex items-center space-x-2">
                <Checkbox
                  id={`metric-${metric}`}
                  checked={selectedMetrics.includes(metric)}
                  onCheckedChange={() => handleMetricToggle(metric)}
                />
                <Label
                  htmlFor={`metric-${metric}`}
                  className="text-sm capitalize"
                  style={{ color: metricColors[metric] }}
                >
                  {metric}
                </Label>
              </div>
            ))}
          </div>
          <ChartSettings
            settings={chartSettings}
            onSettingChange={handleSettingChange}
            type="pie"
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
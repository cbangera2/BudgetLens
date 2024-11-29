"use client";

import { useState, useCallback } from "react";
import { Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer } from "recharts";
import { ChartSettings, ChartSettingsProps } from "./ChartSettings";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { GenericChart } from "./GenericChart";
import { isCreditTransaction } from "@/lib/utils/transactionUtils";

interface MonthlyTrendsChartProps {
  transactions: Transaction[];
}

type MetricType = 'expenses' | 'income' | 'savings';

interface MonthlyMetrics {
  month: string;
  expenses: number;
  income: number;
  savings: number;
}

export function MonthlyTrendsChart({ transactions }: MonthlyTrendsChartProps) {
  const [chartSettings, setChartSettings] = useState<ChartSettingsProps['settings']>({
    valueDisplay: 'value',
    gridType: 'both',
    chartHeight: 300,
    legendPosition: 'right',
    animationDuration: 400,
    chartType: 'line'
  });

  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(['expenses', 'income', 'savings']);

  // Calculate monthly metrics
  const monthlyMetrics = transactions.reduce((acc: Record<string, MonthlyMetrics>, transaction) => {
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
    
    if (isCreditTransaction(transaction)) {
      acc[monthKey].income += amount;
    } else {
      acc[monthKey].expenses += amount;
    }
    
    return acc;
  }, {});

  // Calculate savings for each month
  Object.values(monthlyMetrics).forEach(metrics => {
    metrics.savings = metrics.income - metrics.expenses;
  });

  const data = Object.values(monthlyMetrics).sort((a, b) => {
    const dateA = new Date(a.month);
    const dateB = new Date(b.month);
    return dateA.getTime() - dateB.getTime();
  });

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
      const total = data.reduce((sum, month) => 
        sum + Math.abs(month.expenses) + Math.abs(month.income) + Math.abs(month.savings), 0);
      return `${((value / total) * 100).toFixed(1)}%`;
    }
    return `$${value.toFixed(2)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Monthly Trends</span>
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
            type="line"
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

"use client";

import { useState, useCallback, useMemo } from "react";
import { Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartSettings, ChartSettingsProps } from "./ChartSettings";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { GenericChart } from "./GenericChart";

interface TotalMetricsChartProps {
  transactions: Transaction[];
}

type MetricType = 'expenses' | 'income' | 'savings';

interface TotalMetrics {
  name: string;
  expenses: number;
  income: number;
  savings: number;
}

export function TotalMetricsChart({ transactions }: TotalMetricsChartProps) {
  const [chartSettings, setChartSettings] = useState<ChartSettingsProps['settings']>({
    valueDisplay: 'value',
    gridType: 'both',
    chartHeight: 300,
    legendPosition: 'right',
    animationDuration: 400,
    chartType: 'bar-horizontal'
  });

  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(['expenses', 'income', 'savings']);

  // Calculate total metrics
  const totalMetrics = transactions.reduce((acc: TotalMetrics, transaction) => {
    const amount = transaction.amount;
    
    if (transaction.transactionType === "income" || 
        transaction.transactionType === "Credit" || 
        transaction.transactionType === "credits") {
      acc.income += amount;
    } else if (transaction.transactionType === "expense" || 
               transaction.transactionType === "Debit" || 
               transaction.transactionType === "debits") {
      acc.expenses += amount;
    }
    
    return acc;
  }, {
    name: 'Total',
    income: 0,
    expenses: 0,
    savings: 0
  } as TotalMetrics);

  // Calculate savings
  totalMetrics.savings = totalMetrics.income - totalMetrics.expenses;

  const data = useMemo(() => [totalMetrics], [totalMetrics]);

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
      const total = Math.abs(totalMetrics.expenses) + Math.abs(totalMetrics.income) + Math.abs(totalMetrics.savings);
      return `${((value / total) * 100).toFixed(1)}%`;
    }
    return `$${value.toFixed(2)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Total Metrics</span>
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

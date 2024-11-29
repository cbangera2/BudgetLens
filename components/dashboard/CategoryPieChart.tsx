"use client";

import { useState, useCallback } from "react";
import { CategoryTotal, Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, ResponsiveContainer, Cell, Tooltip, Legend } from "recharts";
import { ChartSettings } from "./ChartSettings";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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
    valueDisplay: 'value' as const,
    chartHeight: 300,
    colorScheme: 'default',
    labelPosition: 'outside' as const,
    animationDuration: 400
  });

  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(['expenses']);

  // Calculate category metrics
  const categoryMetrics = transactions.reduce((acc, transaction) => {
    const category = transaction.category;
    const amount = transaction.amount;
    
    if (!acc[category]) {
      acc[category] = {
        name: category,
        income: 0,
        expenses: 0
      };
    }
    
    if (transaction.transactionType === "income" || 
        transaction.transactionType === "Credit" || 
        transaction.transactionType === "credits") {
      acc[category].income += amount;
    } else if (transaction.transactionType === "expense" || 
               transaction.transactionType === "Debit" || 
               transaction.transactionType === "debits") {
      acc[category].expenses += amount;
    }
    
    return acc;
  }, {} as Record<string, CategoryMetrics>);

  const chartData = Object.values(categoryMetrics)
    .map(metric => ({
      ...metric,
      value: selectedMetrics.reduce((sum, type) => sum + metric[type], 0)
    }))
    .filter(metric => metric.value > 0)
    .sort((a, b) => b.value - a.value);

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

  const getColors = useCallback(() => {
    switch (chartSettings.colorScheme) {
      case 'monochrome':
        return [
          '#1a1a1a', '#333333', '#4d4d4d', '#666666', '#808080',
          '#999999', '#b3b3b3', '#cccccc', '#e6e6e6'
        ];
      case 'categorical':
        return [
          '#e57373', '#f06292', '#ba68c8', '#9575cd', '#7986cb',
          '#64b5f6', '#4fc3f7', '#4dd0e1', '#4db6ac', '#81c784',
          '#aed581', '#dce775', '#fff176', '#ffd54f', '#ffb74d'
        ];
      case 'sequential':
        return [
          '#b71c1c', '#c62828', '#d32f2f', '#e53935', '#f44336',
          '#ef5350', '#e57373', '#ef9a9a', '#ffcdd2'
        ];
      default:
        return [
          '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
          '#14b8a6', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'
        ];
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
      const total = chartData.reduce((sum, item) => sum + item.value, 0);
      const percentage = (value / total * 100).toFixed(1);
      parts.push(`${percentage}%`);
    }
    return parts.join(' / ') || '0';
  }, [chartSettings.valueDisplay, chartData]);

  const colors = getColors();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Category Distribution</CardTitle>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            {['expenses', 'income'].map((metric) => (
              <div key={metric} className="flex items-center space-x-2">
                <Checkbox
                  id={`metric-${metric}`}
                  checked={selectedMetrics.includes(metric as MetricType)}
                  onCheckedChange={() => handleMetricToggle(metric as MetricType)}
                />
                <Label
                  htmlFor={`metric-${metric}`}
                  className="text-sm capitalize"
                  style={{ 
                    color: metric === 'expenses' ? '#ef4444' : '#22c55e'
                  }}
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
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${chartSettings.chartHeight}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={chartSettings.chartHeight * 0.4}
                label={chartSettings.labelPosition !== 'none' ? {
                  position: chartSettings.labelPosition,
                  formatter: (entry: any) => entry.name
                } : false}
                labelLine={chartSettings.labelPosition !== 'none'}
                animationDuration={chartSettings.animationDuration}
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={entry.name} 
                    fill={colors[index % colors.length]} 
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [
                  formatValue(value),
                  selectedMetrics.length > 1 ? 'Total' : selectedMetrics[0]
                ]}
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
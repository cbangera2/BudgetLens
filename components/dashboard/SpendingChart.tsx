"use client";

import { useState, useCallback } from "react";
import { MonthlySpending } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ChartSettings } from "./ChartSettings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Transaction } from "@/lib/types";
import { format } from "date-fns";

interface SpendingChartProps {
  monthlySpending: MonthlySpending[];
  transactions: Transaction[];
}

type MetricType = 'expenses' | 'income' | 'savings';

interface MonthlyMetrics {
  month: string;
  expenses: number;
  income: number;
  savings: number;
}

export function SpendingChart({ monthlySpending, transactions }: SpendingChartProps) {
  const [chartSettings, setChartSettings] = useState({
    valueDisplay: 'value' as const,
    gridType: 'both' as const,
    chartHeight: 300,
    colorScheme: 'default',
    labelPosition: 'outside' as const,
    animationDuration: 400
  });

  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(['expenses']);

  // Calculate monthly metrics
  const monthlyMetrics = transactions.reduce((acc, transaction) => {
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
  }, {} as Record<string, MonthlyMetrics>);

  const chartData = Object.values(monthlyMetrics).sort((a, b) => 
    new Date(a.month).getTime() - new Date(b.month).getTime()
  );

  const handleSettingChange = useCallback((key: string, value: any) => {
    console.log('SpendingChart - Setting change:', key, value);
    setChartSettings((prev) => {
      const newSettings = { ...prev, [key]: value };
      console.log('SpendingChart - New settings:', newSettings);
      return newSettings;
    });
  }, []);

  const handleMetricToggle = (metric: MetricType) => {
    setSelectedMetrics(prev => {
      if (prev.includes(metric)) {
        return prev.filter(m => m !== metric);
      }
      return [...prev, metric];
    });
  };

  const getBarColor = useCallback((metric: MetricType) => {
    const colors = {
      expenses: {
        default: '#ef4444',
        monochrome: '#666666',
        categorical: '#f44336',
        sequential: '#ef5350'
      },
      income: {
        default: '#22c55e',
        monochrome: '#999999',
        categorical: '#4caf50',
        sequential: '#66bb6a'
      },
      savings: {
        default: '#3b82f6',
        monochrome: '#333333',
        categorical: '#2196f3',
        sequential: '#42a5f5'
      }
    };
    return colors[metric][chartSettings.colorScheme] || colors[metric].default;
  }, [chartSettings.colorScheme]);

  const formatTooltip = useCallback((value: number) => {
    const parts = [];
    if (['value', 'both'].includes(chartSettings.valueDisplay)) {
      parts.push(`$${value.toFixed(2)}`);
    }
    if (['percentage', 'both'].includes(chartSettings.valueDisplay)) {
      const total = selectedMetrics.reduce((sum, metric) => 
        sum + chartData.reduce((metricSum, item) => metricSum + item[metric], 0), 0);
      const percentage = (value / total * 100).toFixed(1);
      parts.push(`${percentage}%`);
    }
    return parts.join(' / ') || '0';
  }, [chartSettings, chartData, selectedMetrics]);

  const formatAxisLabel = useCallback((value: number) => {
    if (!['value', 'both'].includes(chartSettings.valueDisplay)) return '';
    return `$${value.toFixed(0)}`;
  }, [chartSettings.valueDisplay]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Monthly Trends</CardTitle>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            {['expenses', 'income', 'savings'].map((metric) => (
              <div key={metric} className="flex items-center space-x-2">
                <Checkbox
                  id={`metric-${metric}`}
                  checked={selectedMetrics.includes(metric as MetricType)}
                  onCheckedChange={() => handleMetricToggle(metric as MetricType)}
                />
                <Label
                  htmlFor={`metric-${metric}`}
                  className="text-sm capitalize"
                  style={{ color: getBarColor(metric as MetricType) }}
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
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${chartSettings.chartHeight}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={chartData}
              margin={{ left: chartSettings.labelPosition === 'outside' ? 60 : 40, right: 10, top: 10, bottom: 20 }}
              animationDuration={chartSettings.animationDuration}
            >
              {chartSettings.gridType !== 'none' && (
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={chartSettings.gridType !== 'vertical'}
                  vertical={chartSettings.gridType !== 'horizontal'}
                />
              )}
              <XAxis dataKey="month" />
              <YAxis tickFormatter={formatAxisLabel} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatTooltip(value),
                  name.charAt(0).toUpperCase() + name.slice(1)
                ]}
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                }}
              />
              {selectedMetrics.map((metric) => (
                <Bar
                  key={metric}
                  dataKey={metric}
                  fill={getBarColor(metric)}
                  radius={[4, 4, 0, 0]}
                  name={metric.charAt(0).toUpperCase() + metric.slice(1)}
                  label={chartSettings.labelPosition !== 'none' ? {
                    position: chartSettings.labelPosition,
                    formatter: formatTooltip,
                  } : false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
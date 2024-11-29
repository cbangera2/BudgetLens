"use client";

import { useState, useCallback } from "react";
import { Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { ChartSettings } from "./ChartSettings";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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
  const [chartSettings, setChartSettings] = useState({
    valueDisplay: 'value' as const,
    gridType: 'both' as const,
    chartHeight: 300,
    colorScheme: 'default',
    labelPosition: 'outside' as const,
    animationDuration: 400
  });

  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(['expenses', 'income', 'savings']);

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
  }, {} as Record<string, MonthlyMetrics>);

  const data = Object.values(monthlyData).sort((a, b) => 
    new Date(a.month).getTime() - new Date(b.month).getTime()
  );

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

    return selectedMetrics.map(metric => colors[metric][chartSettings.colorScheme] || colors[metric].default);
  }, [chartSettings.colorScheme, selectedMetrics]);

  const formatValue = useCallback((value: number) => {
    const parts = [];
    if (['value', 'both'].includes(chartSettings.valueDisplay)) {
      parts.push(new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value));
    }
    if (['percentage', 'both'].includes(chartSettings.valueDisplay)) {
      const total = data.reduce((sum, item) => 
        sum + selectedMetrics.reduce((metricSum, metric) => metricSum + Math.abs(item[metric]), 0), 0);
      const percentage = (Math.abs(value) / total * 100).toFixed(1);
      parts.push(`${percentage}%`);
    }
    return parts.join(' / ') || '0';
  }, [chartSettings.valueDisplay, data, selectedMetrics]);

  const colors = getColors();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Monthly Financial Trends</CardTitle>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            {['expenses', 'income', 'savings'].map((metric, index) => (
              <div key={metric} className="flex items-center space-x-2">
                <Checkbox
                  id={`metric-${metric}`}
                  checked={selectedMetrics.includes(metric as MetricType)}
                  onCheckedChange={() => handleMetricToggle(metric as MetricType)}
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
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${chartSettings.chartHeight}px` }} data-testid="line-chart">
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
              {selectedMetrics.map((metric, index) => (
                <Line
                  key={metric}
                  type="monotone"
                  dataKey={metric}
                  stroke={colors[index]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name={metric.charAt(0).toUpperCase() + metric.slice(1)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

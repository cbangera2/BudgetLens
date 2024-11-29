"use client";

import { useState, useCallback, useMemo } from "react";
import { Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ChartSettings } from "./ChartSettings";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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
  const [chartSettings, setChartSettings] = useState({
    valueDisplay: 'value' as const,
    gridType: 'both' as const,
    chartHeight: 300,
    colorScheme: 'default',
    labelPosition: 'outside' as const,
    animationDuration: 400
  });

  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(['expenses', 'income', 'savings']);

  // Calculate total metrics
  const totalMetrics = transactions.reduce((acc: TotalMetrics, transaction) => {
    const amount = transaction.amount;
    
    if (!acc) {
      acc = {
        name: 'Total',
        income: 0,
        expenses: 0,
        savings: 0
      };
    }
    
    if (transaction.transactionType === "income" || 
        transaction.transactionType === "Credit" || 
        transaction.transactionType === "credits") {
      acc.income += amount;
    } else if (transaction.transactionType === "expense" || 
               transaction.transactionType === "Debit" || 
               transaction.transactionType === "debits") {
      acc.expenses += amount;
    }
    
    acc.savings = acc.income - acc.expenses;
    
    return acc;
  }, {
    name: 'Total',
    income: 0,
    expenses: 0,
    savings: 0
  });

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
      const total = selectedMetrics.reduce((sum, metric) => sum + Math.abs(data[0][metric]), 0);
      const percentage = (Math.abs(value) / total * 100).toFixed(1);
      parts.push(`${percentage}%`);
    }
    return parts.join(' / ') || '0';
  }, [chartSettings.valueDisplay, data, selectedMetrics]);

  const colors = getColors();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Total Financial Metrics</CardTitle>
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
            type="bar"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${chartSettings.chartHeight}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ left: 60, right: 20, top: 20, bottom: 20 }}
              layout="vertical"
              animationDuration={chartSettings.animationDuration}
            >
              {chartSettings.gridType !== 'none' && (
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={chartSettings.gridType !== 'vertical'}
                  vertical={chartSettings.gridType !== 'horizontal'}
                />
              )}
              <XAxis type="number" tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`} />
              <YAxis type="category" dataKey="name" />
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
              {selectedMetrics.map((metric, index) => (
                <Bar
                  key={metric}
                  dataKey={metric}
                  fill={colors[index]}
                  name={metric.charAt(0).toUpperCase() + metric.slice(1)}
                  label={chartSettings.labelPosition !== 'none' ? {
                    position: chartSettings.labelPosition,
                    formatter: formatValue,
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

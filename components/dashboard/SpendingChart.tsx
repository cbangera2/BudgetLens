"use client";

import { useState, useCallback } from "react";
import { MonthlySpending } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ChartSettings } from "./ChartSettings";

interface SpendingChartProps {
  monthlySpending: MonthlySpending[];
}

export function SpendingChart({ monthlySpending }: SpendingChartProps) {
  const [chartSettings, setChartSettings] = useState({
    valueDisplay: 'value' as const,
    gridType: 'both' as const,
    chartHeight: 300,
    colorScheme: 'default',
    labelPosition: 'outside' as const,
    animationDuration: 400
  });

  const handleSettingChange = useCallback((key: string, value: any) => {
    console.log('SpendingChart - Setting change:', key, value);
    setChartSettings((prev) => {
      const newSettings = { ...prev, [key]: value };
      console.log('SpendingChart - New settings:', newSettings);
      return newSettings;
    });
  }, []);

  const formatTooltip = useCallback((value: number) => {
    const parts = [];
    if (['value', 'both'].includes(chartSettings.valueDisplay)) {
      parts.push(`$${value.toFixed(2)}`);
    }
    if (['percentage', 'both'].includes(chartSettings.valueDisplay)) {
      const total = monthlySpending.reduce((sum, item) => sum + item.total, 0);
      const percentage = (value / total * 100).toFixed(1);
      parts.push(`${percentage}%`);
    }
    return [parts.join(' / ') || '0', "Spending"];
  }, [chartSettings, monthlySpending]);

  const getBarColor = useCallback(() => {
    switch (chartSettings.colorScheme) {
      case 'monochrome':
        return 'hsl(var(--primary))';
      case 'categorical':
        return 'hsl(var(--success))';
      case 'sequential':
        return 'hsl(var(--warning))';
      default:
        return 'hsl(var(--chart-1))';
    }
  }, [chartSettings.colorScheme]);

  const formatAxisLabel = useCallback((value: number) => {
    if (!['value', 'both'].includes(chartSettings.valueDisplay)) return '';
    return `$${value.toFixed(0)}`;
  }, [chartSettings.valueDisplay]);

  const formatBarLabel = useCallback((value: number) => {
    const parts = [];
    if (['value', 'both'].includes(chartSettings.valueDisplay)) {
      parts.push(`$${value.toFixed(0)}`);
    }
    if (['percentage', 'both'].includes(chartSettings.valueDisplay)) {
      const total = monthlySpending.reduce((sum, item) => sum + item.total, 0);
      const percentage = (value / total * 100).toFixed(1);
      parts.push(`${percentage}%`);
    }
    return parts.join(' / ') || '';
  }, [chartSettings.valueDisplay, monthlySpending]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Monthly Spending Trends</CardTitle>
        <ChartSettings
          settings={chartSettings}
          onSettingChange={handleSettingChange}
          type="bar"
        />
      </CardHeader>
      <CardContent>
        <div style={{ height: `${chartSettings.chartHeight}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={monthlySpending}
              margin={{ left: chartSettings.labelPosition === 'outside' ? 60 : 40, right: 10, top: 10, bottom: 20 }}
            >
              <XAxis 
                dataKey="month" 
                label={chartSettings.labelPosition !== 'none' ? { 
                  value: "Month",
                  position: "bottom",
                  offset: 0
                } : null}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                label={chartSettings.labelPosition !== 'none' ? { 
                  value: "Amount ($)",
                  angle: -90,
                  position: 'left',
                  offset: 0
                } : null}
                tickFormatter={formatAxisLabel}
                tick={{ fontSize: 12 }}
              />
              {chartSettings.gridType !== 'none' && (
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  horizontal={['horizontal', 'both'].includes(chartSettings.gridType)}
                  vertical={['vertical', 'both'].includes(chartSettings.gridType)}
                />
              )}
              <Tooltip
                formatter={formatTooltip}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem'
                }}
                labelStyle={{
                  color: 'hsl(var(--popover-foreground))',
                  fontWeight: 500,
                  marginBottom: '0.25rem'
                }}
              />
              <Bar
                dataKey="total"
                fill={getBarColor()}
                radius={[4, 4, 0, 0]}
                label={chartSettings.labelPosition !== 'none' ? {
                  position: chartSettings.labelPosition,
                  formatter: formatBarLabel,
                  fontSize: 12,
                  fill: 'hsl(var(--foreground))'
                } : false}
                animationDuration={chartSettings.animationDuration}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
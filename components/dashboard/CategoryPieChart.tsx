"use client";

import { useState, useCallback } from "react";
import { CategoryTotal } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cell, Pie, PieChart, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { ChartSettings } from "./ChartSettings";

interface CategoryPieChartProps {
  categories: CategoryTotal[];
}

export function CategoryPieChart({ categories }: CategoryPieChartProps) {
  const [chartSettings, setChartSettings] = useState({
    valueDisplay: 'both' as const,
    legendPosition: 'right' as const,
    chartHeight: 300,
    colorScheme: 'default',
    labelPosition: 'outside' as const,
    animationDuration: 400
  });

  const handleSettingChange = useCallback((key: string, value: any) => {
    console.log('CategoryPieChart - Setting change:', key, value);
    setChartSettings((prev) => {
      const newSettings = { ...prev, [key]: value };
      console.log('CategoryPieChart - New settings:', newSettings);
      return newSettings;
    });
  }, []);

  const getColors = useCallback(() => {
    switch (chartSettings.colorScheme) {
      case 'monochrome':
        return [
          'hsl(var(--primary))',
          'hsl(var(--primary) / 0.8)',
          'hsl(var(--primary) / 0.6)',
          'hsl(var(--primary) / 0.4)',
          'hsl(var(--primary) / 0.2)'
        ];
      case 'categorical':
        return [
          'hsl(var(--success))',
          'hsl(var(--warning))',
          'hsl(var(--destructive))',
          'hsl(var(--secondary))',
          'hsl(var(--accent))'
        ];
      case 'sequential':
        return [
          'hsl(var(--chart-1))',
          'hsl(var(--chart-2))',
          'hsl(var(--chart-3))',
          'hsl(var(--chart-4))',
          'hsl(var(--chart-5))'
        ];
      default:
        return [
          'hsl(var(--chart-1))',
          'hsl(var(--chart-2))',
          'hsl(var(--chart-3))',
          'hsl(var(--chart-4))',
          'hsl(var(--chart-5))'
        ];
    }
  }, [chartSettings.colorScheme]);

  const formatLabel = useCallback((entry: any) => {
    const parts = [];
    if (['value', 'both'].includes(chartSettings.valueDisplay)) {
      parts.push(`$${entry.value.toFixed(2)}`);
    }
    if (['percentage', 'both'].includes(chartSettings.valueDisplay)) {
      const total = categories.reduce((sum, cat) => sum + cat.total, 0);
      const percentage = ((entry.value / total) * 100).toFixed(1);
      parts.push(`${percentage}%`);
    }
    if (chartSettings.labelPosition === 'outside') {
      parts.unshift(entry.name);
    }
    return parts.join(' / ') || '';
  }, [chartSettings, categories]);

  const formatTooltip = useCallback((value: number, name: string) => {
    const parts = [];
    if (['value', 'both'].includes(chartSettings.valueDisplay)) {
      parts.push(`$${value.toFixed(2)}`);
    }
    if (['percentage', 'both'].includes(chartSettings.valueDisplay)) {
      const total = categories.reduce((sum, cat) => sum + cat.total, 0);
      const percentage = ((value / total) * 100).toFixed(1);
      parts.push(`${percentage}%`);
    }
    return [parts.join(' / ') || '0', name];
  }, [chartSettings, categories]);

  const getLegendProps = useCallback(() => {
    if (chartSettings.legendPosition === 'none') return null;

    const isVertical = ['left', 'right'].includes(chartSettings.legendPosition);
    const align = ['left', 'right'].includes(chartSettings.legendPosition) 
      ? chartSettings.legendPosition 
      : 'center';
    const verticalAlign = ['top', 'bottom'].includes(chartSettings.legendPosition)
      ? chartSettings.legendPosition
      : 'middle';

    return {
      layout: isVertical ? 'vertical' : 'horizontal',
      align,
      verticalAlign,
      formatter: (value: string) => value,
      wrapperStyle: {
        fontSize: '12px',
        color: 'hsl(var(--foreground))',
        padding: '0 8px'
      }
    };
  }, [chartSettings.legendPosition]);

  const colors = getColors();
  const legendProps = getLegendProps();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Spending by Category</CardTitle>
        <ChartSettings
          settings={chartSettings}
          onSettingChange={handleSettingChange}
          type="pie"
        />
      </CardHeader>
      <CardContent>
        <div style={{ height: `${chartSettings.chartHeight}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categories}
                dataKey="total"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={chartSettings.chartHeight * 0.35}
                label={chartSettings.labelPosition !== 'none' ? {
                  position: chartSettings.labelPosition,
                  formatter: formatLabel,
                  fontSize: 12,
                  fill: 'hsl(var(--foreground))'
                } : false}
                labelLine={chartSettings.labelPosition === 'outside' ? {
                  stroke: 'hsl(var(--foreground))',
                  strokeWidth: 1
                } : false}
                animationDuration={chartSettings.animationDuration}
              >
                {categories.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={colors[index % colors.length]}
                  />
                ))}
              </Pie>
              {legendProps && <Legend {...legendProps} />}
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
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
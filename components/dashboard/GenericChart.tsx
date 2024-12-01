"use client";

import {
  Bar,
  BarChart,
  LineChart,
  Line,
  Area,
  AreaChart,
  PieChart,
  Pie,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Legend
} from "recharts";
import { ChartSettingsProps } from "./ChartSettings";

interface GenericChartProps {
  data: any[];
  settings: ChartSettingsProps['settings'];
  selectedMetrics: string[];
  colors?: string[];
  formatValue?: (value: number) => string;
  formatTooltip?: (value: number) => string;
  formatAxisLabel?: (value: number) => string;
}

const getColorPalette = (scheme: string, length: number) => {
  const palettes = {
    default: [
      '#dc2626', '#16a34a', '#2563eb', '#f97316', '#f59e0b',
      '#84cc16', '#d946ef', '#9333ea', '#0891b2', '#0ea5e9',
      '#a855f7', '#ec4899', '#f43f5e', '#10b981', '#3b82f6'
    ],
    monochrome: ['#333333', '#4d4d4d', '#666666', '#808080', '#999999'],
    pastel: ['#aec6cf', '#ffb3ba', '#ffdfba', '#ffffba', '#baffc9'],
    vibrant: ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231'],
    cool: ['#30a5ff', '#1f77b4', '#aec7e8', '#ffbb78', '#98df8a'],
    warm: ['#ff7f0e', '#ffbb78', '#d62728', '#ff9896', '#9467bd']
  };
  const baseColors = palettes[scheme] || palettes.default;
  const palette = [];
  for (let i = 0; i < length; i++) {
    palette.push(baseColors[i % baseColors.length]);
    if (i >= baseColors.length) {
      // Generate a new color by slightly altering the base color
      const colorIndex = i % baseColors.length;
      const newColor = baseColors[colorIndex].replace(/\d+/g, (match) => (parseInt(match) + (i * 5) % 255).toString());
      palette[i] = newColor;
    }
  }
  return palette;
};

const DEFAULT_COLORS = [
  '#dc2626', // red-600
  '#16a34a', // green-600
  '#2563eb', // blue-600
  '#ca8a04', // yellow-600
  '#9333ea', // purple-600
  '#0891b2', // cyan-600
  '#c2410c', // orange-600
  '#be185d', // pink-600
];

const generateColorPalette = (length: number) => {
  const baseColors = [
    '#dc2626', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
    '#14b8a6', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'
  ];
  const palette = [];
  for (let i = 0; i < length; i++) {
    palette.push(baseColors[i % baseColors.length]);
  }
  return palette;
};

export function GenericChart({
  data,
  settings,
  selectedMetrics,
  colors = DEFAULT_COLORS,
  formatValue = (value) => `$${value.toFixed(2)}`,
  formatTooltip = (value) => `$${value.toFixed(2)}`,
  formatAxisLabel = (value) => `$${(value / 1000).toFixed(1)}k`
}: GenericChartProps) {
  const chartColors = getColorPalette(settings.colorScheme, selectedMetrics.length);

  const commonTooltipProps = {
    formatter: (value: number, name: string | undefined) => [
      formatTooltip(value),
      typeof name === 'string' ? name.charAt(0).toUpperCase() + name.slice(1) : ''
    ],
    contentStyle: {
      backgroundColor: 'var(--background)',
      border: '1px solid var(--border)',
    }
  };

  const commonGridProps = settings.gridType !== 'none' ? {
    strokeDasharray: "3 3",
    horizontal: settings.gridType !== 'vertical',
    vertical: settings.gridType !== 'horizontal'
  } : undefined;

  const commonProps = {
    data,
    margin: { left: 60, right: 20, top: 20, bottom: 20 },
    animationDuration: settings.animationDuration
  };

  const commonLegendProps = settings.legendPosition !== 'none' ? {
    layout: settings.legendPosition === 'left' || settings.legendPosition === 'right' ? 'vertical' : 'horizontal' as const,
    align: settings.legendPosition === 'left' ? 'left' : settings.legendPosition === 'right' ? 'right' : 'center',
    verticalAlign: settings.legendPosition === 'top' ? 'top' : 'bottom',
    wrapperStyle: {
      paddingTop: settings.legendPosition === 'bottom' ? '20px' : '0px',
      paddingBottom: settings.legendPosition === 'top' ? '20px' : '0px'
    }
  } : undefined;

  const renderLabel = (props: any) => {
    if (settings.valueDisplay === 'none') return '';
    
    const { value } = props;
    const total = data.reduce((sum, item) => 
      sum + selectedMetrics.reduce((metricSum, metric) => metricSum + (item[metric] || 0), 0), 0);
    const percentage = ((value / total) * 100).toFixed(1);
    
    switch (settings.valueDisplay) {
      case 'value':
        return formatValue(value);
      case 'percentage':
        return `${percentage}%`;
      case 'both':
        return `${formatValue(value)} (${percentage}%)`;
      default:
        return '';
    }
  };

  const commonBarProps = {
    label: settings.valueDisplay !== 'none' ? {
      position: 'top',
      content: renderLabel
    } : false
  };

  const commonLineProps = {
    label: settings.valueDisplay !== 'none' ? {
      position: 'top',
      content: renderLabel
    } : false
  };

  switch (settings.chartType) {
    case 'bar-vertical':
      return (
        <ResponsiveContainer width="100%" height={settings.chartHeight}>
          <BarChart {...commonProps}>
            {commonGridProps && <CartesianGrid {...commonGridProps} />}
            <XAxis dataKey="name" />
            <YAxis tickFormatter={formatAxisLabel} />
            <Tooltip {...commonTooltipProps} />
            {selectedMetrics.map((metric, index) => (
              <Bar
                key={metric}
                dataKey={metric}
                fill={chartColors[index]}
                name={metric.charAt(0).toUpperCase() + metric.slice(1)}
                {...commonBarProps}
              />
            ))}
            {commonLegendProps && <Legend {...commonLegendProps} />}
          </BarChart>
        </ResponsiveContainer>
      );

    case 'bar-horizontal':
      return (
        <ResponsiveContainer width="100%" height={settings.chartHeight}>
          <BarChart {...commonProps} layout="vertical">
            {commonGridProps && <CartesianGrid {...commonGridProps} />}
            <XAxis type="number" tickFormatter={formatAxisLabel} />
            <YAxis dataKey="name" type="category" />
            <Tooltip {...commonTooltipProps} />
            {selectedMetrics.map((metric, index) => (
              <Bar
                key={metric}
                dataKey={metric}
                fill={chartColors[index]}
                name={metric.charAt(0).toUpperCase() + metric.slice(1)}
                {...commonBarProps}
              />
            ))}
            {commonLegendProps && <Legend {...commonLegendProps} />}
          </BarChart>
        </ResponsiveContainer>
      );

    case 'line':
      return (
        <ResponsiveContainer width="100%" height={settings.chartHeight}>
          <LineChart {...commonProps}>
            {commonGridProps && <CartesianGrid {...commonGridProps} />}
            <XAxis dataKey="name" />
            <YAxis tickFormatter={formatAxisLabel} />
            <Tooltip {...commonTooltipProps} />
            {selectedMetrics.map((metric, index) => (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={chartColors[index]}
                name={metric.charAt(0).toUpperCase() + metric.slice(1)}
                {...commonLineProps}
              />
            ))}
            {commonLegendProps && <Legend {...commonLegendProps} />}
          </LineChart>
        </ResponsiveContainer>
      );

    case 'area':
      return (
        <ResponsiveContainer width="100%" height={settings.chartHeight}>
          <AreaChart {...commonProps}>
            {commonGridProps && <CartesianGrid {...commonGridProps} />}
            <XAxis dataKey="name" />
            <YAxis tickFormatter={formatAxisLabel} />
            <Tooltip {...commonTooltipProps} />
            {selectedMetrics.map((metric, index) => (
              <Area
                key={metric}
                type="monotone"
                dataKey={metric}
                fill={chartColors[index]}
                stroke={chartColors[index]}
                name={metric.charAt(0).toUpperCase() + metric.slice(1)}
                {...commonLineProps}
              />
            ))}
            {commonLegendProps && <Legend {...commonLegendProps} />}
          </AreaChart>
        </ResponsiveContainer>
      );

    case 'pie':
      const pieData = data.map(item => ({
        name: item.name,
        value: selectedMetrics.reduce((sum, metric) => sum + Math.abs(item[metric] || 0), 0),
        originalValue: selectedMetrics.reduce((sum, metric) => sum + (item[metric] || 0), 0)
      }));
      const chartColorsForPie = getColorPalette(settings.colorScheme, pieData.length);
      const total = pieData.reduce((sum: number, item: any) => sum + item.value, 0);

      const renderPieLabel = (entry: any) => {
        if (settings.valueDisplay === 'none') return '';
        
        const value = formatValue(entry.value);
        const percentage = `${((entry.value / total) * 100).toFixed(1)}%`;
        
        switch (settings.valueDisplay) {
          case 'value':
            return value;
          case 'percentage':
            return percentage;
          case 'both':
            return `${value} (${percentage})`;
          default:
            return '';
        }
      };

      return (
        <ResponsiveContainer width="100%" height={settings.chartHeight}>
          <PieChart margin={commonProps.margin}>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={settings.labelPosition !== 'none' ? {
                position: settings.labelPosition,
                formatter: (entry: any) => {
                  const total = pieData.reduce((sum: number, item: any) => sum + item.value, 0);
                  const percent = (entry.value / total) * 100;
                  
                  if (settings.valueDisplay === 'percentage') {
                    return `${percent.toFixed(1)}%`;
                  } else if (settings.valueDisplay === 'value') {
                    return formatValue(entry.value);
                  } else if (settings.valueDisplay === 'both') {
                    return `${formatValue(entry.value)} (${percent.toFixed(1)}%)`;
                  }
                  return entry.name;
                }
              } : false}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={chartColorsForPie[index]} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value: number, name: string, entry: any) => [
                formatTooltip(Math.abs(entry.payload.originalValue)),
                entry.payload.name
              ]}
            />
            {commonLegendProps && <Legend {...commonLegendProps} />}
          </PieChart>
        </ResponsiveContainer>
      );

    default:
      return null;
  }
}

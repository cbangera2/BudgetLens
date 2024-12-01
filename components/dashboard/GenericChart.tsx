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
  Legend,
  LabelList
} from "recharts";
import { ChartSettingsProps } from "./ChartSettings";
import { format, parseISO } from "date-fns";

interface GenericChartProps {
  data: any[];
  settings: ChartSettingsProps['settings'];
  selectedMetrics: string[];
  colors?: string[];
  formatValue?: (value: number) => string;
  formatTooltip?: (value: number) => string;
  formatAxisLabel?: (value: number) => string;
}

const getColorPalette = (scheme: 'default' | 'warm' | 'cool' | 'rainbow' = 'default', length: number) => {
  const defaultColors = [
    '#dc2626', // red-600
    '#16a34a', // green-600
    '#2563eb', // blue-600
    '#9333ea', // purple-600
    '#d97706', // amber-600
    '#0891b2', // cyan-600
    '#4f46e5', // indigo-600
    '#be185d', // pink-600
  ];

  const warmColors = [
    '#dc2626', // red
    '#f97316', // orange
    '#f59e0b', // amber
    '#ca8a04', // yellow
    '#84cc16', // lime
    '#22c55e', // green
    '#14b8a6', // teal
    '#0ea5e9', // sky
  ];

  const coolColors = [
    '#2563eb', // blue
    '#0ea5e9', // sky
    '#06b6d4', // cyan
    '#14b8a6', // teal
    '#10b981', // emerald
    '#6366f1', // indigo
    '#8b5cf6', // violet
    '#a855f7', // purple
  ];

  const rainbowColors = [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#06b6d4', // cyan
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#d946ef', // fuchsia
  ];

  let baseColors: string[];
  switch (scheme) {
    case 'warm':
      baseColors = warmColors;
      break;
    case 'cool':
      baseColors = coolColors;
      break;
    case 'rainbow':
      baseColors = rainbowColors;
      break;
    default:
      baseColors = defaultColors;
  }

  // If we need more colors than in our base palette, interpolate between existing colors
  if (length > baseColors.length) {
    const result: string[] = [];
    for (let i = 0; i < length; i++) {
      const index = (i * baseColors.length) / length;
      const start = Math.floor(index);
      const end = (start + 1) % baseColors.length;
      const fraction = index - start;
      
      // Simple linear interpolation between colors
      const startColor = baseColors[start];
      const endColor = baseColors[end];
      const interpolatedColor = interpolateColor(startColor, endColor, fraction);
      result.push(interpolatedColor);
    }
    return result;
  }

  return baseColors.slice(0, length);
};

const interpolateColor = (color1: string, color2: string, factor: number): string => {
  const c1 = {
    r: parseInt(color1.slice(1, 3), 16),
    g: parseInt(color1.slice(3, 5), 16),
    b: parseInt(color1.slice(5, 7), 16)
  };
  const c2 = {
    r: parseInt(color2.slice(1, 3), 16),
    g: parseInt(color2.slice(3, 5), 16),
    b: parseInt(color2.slice(5, 7), 16)
  };

  const r = Math.round(c1.r + (c2.r - c1.r) * factor);
  const g = Math.round(c1.g + (c2.g - c1.g) * factor);
  const b = Math.round(c1.b + (c2.b - c1.b) * factor);

  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
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
  console.log('Chart data:', data); // Debug log

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
    const { value, x, y, width, height, viewBox } = props;
    const total = data.reduce((sum, item) =>
      sum + selectedMetrics.reduce((metricSum, metric) => metricSum + (item[metric] || 0), 0), 0);

    if (settings.valueDisplay === 'none') return null;

    const displayValue = settings.valueDisplay === 'percentage' || settings.valueDisplay === 'both'
      ? `${((value / total) * 100).toFixed(1)}%`
      : formatValue(value);

    const displayBoth = settings.valueDisplay === 'both'
      ? `${formatValue(value)} (${((value / total) * 100).toFixed(1)}%)`
      : displayValue;

    // For bar charts
    if (width !== undefined && height !== undefined) {
      return (
        <text x={x + width / 2} y={y + height / 2} fill={settings.labelColor} textAnchor="middle" dominantBaseline="middle">
          {displayBoth}
        </text>
      );
    }
    
    // For line charts
    return (
      <text x={x} y={y - 10} fill={settings.labelColor} textAnchor="middle">
        {displayBoth}
      </text>
    );
  };

  const commonBarProps = {
    label: settings.valueDisplay !== 'none' ? {
      position: 'inside',
      content: renderLabel
    } : false
  };

  const commonLineProps = {
    label: settings.valueDisplay !== 'none' ? {
      position: 'top',
      content: renderLabel
    } : false
  };

  const formatXAxis = (value: string) => {
    // If the value is already formatted (e.g., "Jan 2024"), return it as is
    if (value.match(/^[A-Za-z]{3}\s+\d{4}$/)) {
      return value;
    }

    try {
      const date = parseISO(value);
      return format(date, 'MMM yyyy');
    } catch (error) {
      return value;
    }
  };

  switch (settings.chartType) {
    case 'bar-vertical':
      return (
        <ResponsiveContainer width="100%" height={settings.chartHeight}>
          <BarChart {...commonProps}>
            {commonGridProps && <CartesianGrid {...commonGridProps} />}
            <XAxis 
              dataKey="month"
              type="category"
            />
            <YAxis tickFormatter={formatAxisLabel} />
            <Tooltip {...commonTooltipProps} />
            {selectedMetrics.map((metric, index) => (
              <Bar
                key={metric}
                dataKey={metric}
                fill={chartColors[index]}
                name={metric.charAt(0).toUpperCase() + metric.slice(1)}
                {...commonBarProps}
              >
              </Bar>
            ))}
            {commonLegendProps && <Legend {...commonLegendProps} />}
          </BarChart>
        </ResponsiveContainer>
      );

    case 'bar-horizontal':
      return (
        <ResponsiveContainer width="100%" height={settings.chartHeight}>
          <BarChart layout="vertical" {...commonProps}>
            {commonGridProps && <CartesianGrid {...commonGridProps} />}
            <XAxis type="number" tickFormatter={formatAxisLabel} />
            <YAxis 
              dataKey="month"
              type="category"
            />
            <Tooltip {...commonTooltipProps} />
            {selectedMetrics.map((metric, index) => (
              <Bar
                key={metric}
                dataKey={metric}
                fill={chartColors[index]}
                name={metric.charAt(0).toUpperCase() + metric.slice(1)}
                {...commonBarProps}
              >
              </Bar>
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
            <XAxis 
              dataKey="month"
              type="category"
            />
            <YAxis tickFormatter={formatAxisLabel} />
            <Tooltip {...commonTooltipProps} />
            {selectedMetrics.map((metric, index) => (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={chartColors[index]}
                {...commonLineProps}
              >

              </Line>
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
                fill: settings.labelColor,
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

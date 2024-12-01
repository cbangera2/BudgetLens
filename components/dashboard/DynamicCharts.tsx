"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GenericChart } from './GenericChart';
import { ChartCreator, NewChartConfig } from './ChartCreator';
import { MetricType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface DynamicChartsProps {
  data: any[];
  availableMetrics: MetricType[];
  formatValue?: (value: number) => string;
  formatTooltip?: (value: number) => string;
  formatAxisLabel?: (value: number) => string;
}

interface DynamicChart extends NewChartConfig {
  id: string;
}

export function DynamicCharts({
  data,
  availableMetrics,
  formatValue,
  formatTooltip,
  formatAxisLabel
}: DynamicChartsProps) {
  const [charts, setCharts] = useState<DynamicChart[]>([]);

  const handleCreateChart = (config: NewChartConfig) => {
    const newChart: DynamicChart = {
      ...config,
      id: Math.random().toString(36).substring(7),
    };
    setCharts(prev => [...prev, newChart]);
  };

  const handleRemoveChart = (id: string) => {
    setCharts(prev => prev.filter(chart => chart.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ChartCreator
          onCreateChart={handleCreateChart}
          availableMetrics={availableMetrics}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {charts.map((chart) => (
          <Card key={chart.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{chart.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveChart(chart.id)}
                  className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Remove chart</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ height: `${chart.settings.chartHeight}px` }}>
                <GenericChart
                  data={data}
                  settings={chart.settings}
                  selectedMetrics={chart.selectedMetrics}
                  formatValue={formatValue}
                  formatTooltip={formatTooltip}
                  formatAxisLabel={formatAxisLabel}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

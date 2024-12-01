"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GenericChart } from './GenericChart';
import { ChartCreator, NewChartConfig } from './ChartCreator';
import { MetricType, Transaction } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { ChartSettings, ChartSettingsProps } from './ChartSettings';
import { DraggableCard } from './DraggableCard';
import { FilterBar } from './FilterBar';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface DynamicChartsProps {
  data: Transaction[];
  availableMetrics: MetricType[];
  formatValue?: (value: number) => string;
  formatTooltip?: (value: number) => string;
  formatAxisLabel?: (value: number) => string;
}

interface DynamicChart extends NewChartConfig {
  id: string;
  filteredData?: Transaction[];
}

export function DynamicCharts({
  data,
  availableMetrics,
  formatValue,
  formatTooltip,
  formatAxisLabel
}: DynamicChartsProps) {
  const [charts, setCharts] = useState<DynamicChart[]>(() => {
    const defaultChart: DynamicChart = {
      id: 'default-chart',
      title: 'Monthly Overview',
      settings: {
        valueDisplay: 'value',
        gridType: 'both',
        chartHeight: 300,
        chartWidth: undefined, // Auto width
        legendPosition: 'bottom',
        animationDuration: 400,
        chartType: 'bar-vertical',
        colorScheme: 'default',
        labelColor: 'black',
        chartSize: 'medium'
      },
      selectedMetrics: availableMetrics.slice(0, 2),
      filteredData: data
    };
    return [defaultChart];
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleCreateChart = (config: NewChartConfig) => {
    const newChart: DynamicChart = {
      ...config,
      id: Math.random().toString(36).substring(7),
      selectedMetrics: config.selectedMetrics.length > 0 ? config.selectedMetrics : availableMetrics.slice(0, 2),
      filteredData: data
    };
    setCharts(prev => [...prev, newChart]);
  };

  const handleRemoveChart = (id: string) => {
    setCharts(prev => prev.filter(chart => chart.id !== id));
  };

  const handleSettingChange = (chartId: string, key: string, value: any) => {
    setCharts(prev => prev.map(chart => {
      if (chart.id === chartId) {
        return {
          ...chart,
          settings: {
            ...chart.settings,
            [key]: value
          }
        };
      }
      return chart;
    }));
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setCharts((charts) => {
        const oldIndex = charts.findIndex((chart) => chart.id === active.id);
        const newIndex = charts.findIndex((chart) => chart.id === over.id);
        return arrayMove(charts, oldIndex, newIndex);
      });
    }
  };

  const handleFilter = (chartId: string, filteredData: Transaction[]) => {
    setCharts(prev => prev.map(chart => {
      if (chart.id === chartId) {
        return {
          ...chart,
          filteredData
        };
      }
      return chart;
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ChartCreator
          onCreateChart={handleCreateChart}
          availableMetrics={availableMetrics}
        />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={charts.map(chart => chart.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {charts.map((chart) => {
              const chartType = chart.settings.chartType === 'pie' ? 'pie' :
                              chart.settings.chartType?.startsWith('bar') ? 'bar' : 'line';
                              
              return (
                <DraggableCard
                  key={chart.id}
                  id={chart.id}
                  onDelete={() => handleRemoveChart(chart.id)}
                  className="w-full"
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {chart.title}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <ChartSettings
                        settings={chart.settings}
                        onSettingChange={(key, value) => handleSettingChange(chart.id, key, value)}
                        type={chartType}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <FilterBar
                      transactions={data}
                      onCategoryFilter={(includes, excludes) => {
                        const filtered = data.filter(t => {
                          if (includes.length && !includes.includes(t.category)) return false;
                          if (excludes.length && excludes.includes(t.category)) return false;
                          return true;
                        });
                        handleFilter(chart.id, filtered);
                      }}
                      onVendorFilter={(includes, excludes) => {
                        const filtered = data.filter(t => {
                          if (includes.length && !includes.includes(t.vendor)) return false;
                          if (excludes.length && excludes.includes(t.vendor)) return false;
                          return true;
                        });
                        handleFilter(chart.id, filtered);
                      }}
                      onTransactionTypeFilter={(includes, excludes) => {
                        const filtered = data.filter(t => {
                          if (includes.length && !includes.includes(t.type)) return false;
                          if (excludes.length && excludes.includes(t.type)) return false;
                          return true;
                        });
                        handleFilter(chart.id, filtered);
                      }}
                      onDateFilter={(startDate, endDate) => {
                        const filtered = data.filter(t => {
                          const date = new Date(t.date);
                          if (startDate && date < startDate) return false;
                          if (endDate && date > endDate) return false;
                          return true;
                        });
                        handleFilter(chart.id, filtered);
                      }}
                    />
                    <GenericChart
                      data={chart.filteredData || data}
                      settings={chart.settings}
                      selectedMetrics={chart.selectedMetrics}
                      formatValue={formatValue}
                      formatTooltip={formatTooltip}
                      formatAxisLabel={formatAxisLabel}
                    />
                  </CardContent>
                </DraggableCard>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

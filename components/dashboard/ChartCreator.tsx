"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChartSettings, ChartSettingsProps } from './ChartSettings';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { MetricType } from '@/lib/types';
import { Plus } from 'lucide-react';

interface ChartCreatorProps {
  onCreateChart: (config: NewChartConfig) => void;
  availableMetrics: MetricType[];
}

export interface NewChartConfig {
  title: string;
  settings: ChartSettingsProps['settings'];
  selectedMetrics: MetricType[];
}

export function ChartCreator({ onCreateChart, availableMetrics }: ChartCreatorProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [chartSettings, setChartSettings] = useState<ChartSettingsProps['settings']>({
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
  });
  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>([]);

  const handleSettingChange = (key: string, value: any) => {
    setChartSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleCreateChart = () => {
    if (!title || selectedMetrics.length === 0) return;

    onCreateChart({
      title,
      settings: chartSettings,
      selectedMetrics: selectedMetrics.length > 0 ? selectedMetrics : availableMetrics.slice(0, 2),
    });

    // Reset form
    setTitle('');
    setSelectedMetrics([]);
    setChartSettings({
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
    });
    setOpen(false);
  };

  const handleMetricToggle = (metric: MetricType) => {
    setSelectedMetrics(prev => {
      if (prev.includes(metric)) {
        return prev.filter(m => m !== metric);
      }
      return [...prev, metric];
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Plus className="h-4 w-4" />
          <span className="sr-only">Add new chart</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Chart</DialogTitle>
          <DialogDescription>
            Configure your new chart with the settings below.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right">Metrics</Label>
            <div className="col-span-3 space-y-2">
              {availableMetrics.map((metric) => (
                <div key={metric} className="flex items-center space-x-2">
                  <Checkbox
                    id={`metric-${metric}`}
                    checked={selectedMetrics.includes(metric)}
                    onCheckedChange={() => handleMetricToggle(metric)}
                  />
                  <Label
                    htmlFor={`metric-${metric}`}
                    className="text-sm capitalize"
                  >
                    {metric}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Settings</Label>
            <div className="col-span-3">
              <ChartSettings
                settings={chartSettings}
                onSettingChange={handleSettingChange}
                type={chartSettings.chartType?.includes('bar') ? 'bar' : chartSettings.chartType === 'line' ? 'line' : 'pie'}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreateChart} disabled={!title || selectedMetrics.length === 0}>
            Create Chart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export type ChartType = 'bar-vertical' | 'bar-horizontal' | 'line' | 'pie' | 'area';
export type ValueDisplayType = 'none' | 'value' | 'percentage' | 'both';
export type GridType = 'none' | 'horizontal' | 'vertical' | 'both';
export type LegendPosition = 'none' | 'right' | 'bottom' | 'left' | 'top';
export type LabelPosition = 'none' | 'inside' | 'outside' | 'center';
export type ColorScheme = 'default' | 'warm' | 'cool' | 'rainbow';
export type LabelColor = 'white' | 'gray' | 'black';
export type ChartSize = 'small' | 'medium' | 'large' | 'custom';

export interface ChartSettingsProps {
  settings: {
    chartType?: ChartType;
    valueDisplay?: ValueDisplayType;
    gridType?: GridType;
    chartHeight?: number;
    chartWidth?: number;
    legendPosition?: LegendPosition;
    labelPosition?: LabelPosition;
    colorScheme?: ColorScheme;
    animationDuration?: number;
    labelColor?: LabelColor;
    chartSize?: ChartSize;
  };
  onSettingChange: (key: string, value: any) => void;
  type?: 'bar' | 'line' | 'pie';
}

export function ChartSettings({ settings, onSettingChange, type }: ChartSettingsProps) {
  const handleChartSizeChange = (size: ChartSize) => {
    let height: number;
    let width: number | undefined;
    switch (size) {
      case 'small':
        height = 200;
        width = undefined; // Use container width
        break;
      case 'medium':
        height = 300;
        width = undefined; // Use container width
        break;
      case 'large':
        height = 400;
        width = undefined; // Use container width
        break;
      default:
        height = settings.chartHeight || 300;
        width = settings.chartWidth;
    }
    onSettingChange('chartHeight', height);
    onSettingChange('chartWidth', width);
    onSettingChange('chartSize', size);
  };

  return (
    <div className="z-50" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent hover:text-accent-foreground">
            <Settings2 className="h-4 w-4" />
            <span className="sr-only">Open chart settings</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[220px]" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel>Chart Settings</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Chart Size Options */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Chart Size</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[250px]">
              <DropdownMenuRadioGroup
                value={settings.chartSize || 'medium'}
                onValueChange={(value: string) => handleChartSizeChange(value as ChartSize)}
              >
                <DropdownMenuRadioItem value="small">Small (200px height)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="medium">Medium (300px height)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="large">Large (400px height)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="custom">Custom</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              
              <DropdownMenuSeparator />
              
              <div className="p-2 space-y-2">
                <div>
                  <Label>Height (px)</Label>
                  <Input
                    type="number"
                    value={settings.chartHeight || 300}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      onSettingChange('chartHeight', value);
                      onSettingChange('chartSize', 'custom');
                    }}
                    min={100}
                    max={800}
                    step={50}
                    className="w-full mt-1"
                  />
                </div>
                <div>
                  <Label>Width (px)</Label>
                  <Input
                    type="number"
                    value={settings.chartWidth || ''}
                    placeholder="Auto"
                    onChange={(e) => {
                      const value = e.target.value ? parseInt(e.target.value) : undefined;
                      onSettingChange('chartWidth', value);
                      if (value !== undefined) {
                        onSettingChange('chartSize', 'custom');
                      }
                    }}
                    min={200}
                    max={1200}
                    step={50}
                    className="w-full mt-1"
                  />
                  <div className="text-xs text-muted-foreground mt-1">Leave empty for auto width</div>
                </div>
              </div>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Chart Type Options */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Chart Type</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={settings.chartType || 'bar-vertical'}
                onValueChange={(value: string) => 
                  onSettingChange('chartType', value as ChartType)
                }
              >
                <DropdownMenuRadioItem value="bar-vertical">Bar (Vertical)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="bar-horizontal">Bar (Horizontal)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="line">Line</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="area">Area</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="pie">Pie</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Value Display Options */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Label Display</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={settings.valueDisplay}
                onValueChange={(value: string) => 
                  onSettingChange('valueDisplay', value as ValueDisplayType)
                }
              >
                <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="value">Values Only</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="percentage">Percentages Only</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="both">Both</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Label Color Options */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Label Color</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={settings.labelColor || 'black'}
                onValueChange={(value: string) => 
                  onSettingChange('labelColor', value as LabelColor)
                }
              >
                <DropdownMenuRadioItem value="white">White</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="gray">Gray</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="black">Black</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Legend Position Options */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Legend Position</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={settings.legendPosition || 'right'}
                onValueChange={(value: string) => 
                  onSettingChange('legendPosition', value as LegendPosition)
                }
              >
                <DropdownMenuRadioItem value="none">Hidden</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="left">Left</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Label Position Options for Pie Chart */}
          {settings.chartType === 'pie' && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Label Position</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={settings.labelPosition || 'outside'}
                  onValueChange={(value: string) => 
                    onSettingChange('labelPosition', value as LabelPosition)
                  }
                >
                  <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="inside">Inside</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="outside">Outside</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="center">Center</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {/* Grid Options for Bar/Line Charts */}
          {(type === 'bar' || type === 'line') && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Grid Lines</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={settings.gridType || 'none'}
                  onValueChange={(value: string) => 
                    onSettingChange('gridType', value as GridType)
                  }
                >
                  <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="horizontal">Horizontal Only</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="vertical">Vertical Only</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="both">Both</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {/* Color Scheme Options */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Color Scheme</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={settings.colorScheme || 'default'}
                onValueChange={(value: string) => 
                  onSettingChange('colorScheme', value as ColorScheme)
                }
              >
                <DropdownMenuRadioItem value="default">Default</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="warm">Warm</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="cool">Cool</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="rainbow">Rainbow</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

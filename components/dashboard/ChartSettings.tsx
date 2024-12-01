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

export type ChartType = 'bar-vertical' | 'bar-horizontal' | 'line' | 'pie' | 'area';
export type ValueDisplayType = 'none' | 'value' | 'percentage' | 'both';
export type GridType = 'none' | 'horizontal' | 'vertical' | 'both';
export type LegendPosition = 'none' | 'right' | 'bottom' | 'left' | 'top';
export type LabelPosition = 'none' | 'inside' | 'outside' | 'center';
export type ColorScheme = 'default' | 'warm' | 'cool' | 'rainbow';

export interface ChartSettingsProps {
  settings: {
    chartType?: ChartType;
    valueDisplay?: ValueDisplayType;
    gridType?: GridType;
    chartHeight?: number;
    legendPosition?: LegendPosition;
    labelPosition?: LabelPosition;
    colorScheme?: ColorScheme;
    animationDuration?: number;
  };
  onSettingChange: (key: string, value: any) => void;
  type?: 'bar' | 'line' | 'pie';
}

export function ChartSettings({ settings, onSettingChange, type }: ChartSettingsProps) {
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
          
          {/* Chart Type Options */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Chart Type</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={settings.chartType || 'bar-vertical'}
                onValueChange={(value: ChartType) => 
                  onSettingChange('chartType', value)
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
            <DropdownMenuSubTrigger>Value Display</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={settings.valueDisplay}
                onValueChange={(value: ValueDisplayType) => 
                  onSettingChange('valueDisplay', value)
                }
              >
                <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="value">Values Only</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="percentage">Percentages Only</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="both">Both</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Legend Position Options */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Legend Position</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={settings.legendPosition || 'right'}
                onValueChange={(value: LegendPosition) => 
                  onSettingChange('legendPosition', value)
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
                  onValueChange={(value: LabelPosition) => 
                    onSettingChange('labelPosition', value)
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
                  onValueChange={(value: GridType) => 
                    onSettingChange('gridType', value)
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
                onValueChange={(value: ColorScheme) => 
                  onSettingChange('colorScheme', value)
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

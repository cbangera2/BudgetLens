"use client"

import { Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"

interface ChartSettingsProps {
  settings: {
    valueDisplay: 'none' | 'value' | 'percentage' | 'both'
    legendPosition?: 'none' | 'right' | 'bottom' | 'left' | 'top'
    gridType?: 'none' | 'horizontal' | 'vertical' | 'both'
    chartHeight?: number
    colorScheme?: string
    labelPosition?: 'inside' | 'outside' | 'none'
    animationDuration?: number
    chartType?: 'bar-vertical' | 'bar-horizontal' | 'line' | 'pie' | 'area' | 'scatter'
  }
  onSettingChange: (
    key: keyof Pick<ChartSettingsProps['settings'], 
      'valueDisplay' | 'legendPosition' | 'gridType' | 'labelPosition' | 
      'colorScheme' | 'chartHeight' | 'animationDuration' | 'chartType'
    >, 
    value: 'none' | 'value' | 'percentage' | 'both' | 'right' | 'bottom' | 'left' | 'top' | 
      'horizontal' | 'vertical' | 'inside' | 'outside' | 'bar-vertical' | 'bar-horizontal' | 
      'line' | 'pie' | 'area' | 'scatter' | number | string
  ) => void
  type: 'pie' | 'bar' | 'line'
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
                onValueChange={(value: 'bar-vertical' | 'bar-horizontal' | 'line' | 'pie' | 'area' | 'scatter') => 
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
                onValueChange={(value: 'none' | 'value' | 'percentage' | 'both') => 
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
                  onValueChange={(value: 'none' | 'right' | 'bottom' | 'left' | 'top') => 
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
          

          {/* Grid Options for Bar Chart */}
          {type === 'bar' && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Grid Lines</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={settings.gridType || 'none'}
                  onValueChange={(value: 'none' | 'horizontal' | 'vertical' | 'both') => 
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

          <DropdownMenuSeparator />

          {/* Label Position */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Label Position</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={settings.labelPosition || 'outside'}
                onValueChange={(value) => onSettingChange('labelPosition', value)}
              >
                <DropdownMenuRadioItem value="inside">Inside</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="outside">Outside</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Color Scheme Options */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Color Scheme</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={settings.colorScheme || 'default'}
                onValueChange={(value: 'default' | 'monochrome' | 'pastel' | 'vibrant' | 'cool' | 'warm') => 
                  onSettingChange('colorScheme', value)
                }
              >
                <DropdownMenuRadioItem value="default">Default</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="monochrome">Monochrome</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="pastel">Pastel</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="vibrant">Vibrant</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="cool">Cool</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="warm">Warm</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Chart Height */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Chart Height</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={String(settings.chartHeight || 300)}
                onValueChange={(value) => onSettingChange('chartHeight', parseInt(value))}
              >
                <DropdownMenuRadioItem value="200">Small (200px)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="300">Medium (300px)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="400">Large (400px)</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Animation Duration */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Animation</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={String(settings.animationDuration || 400)}
                onValueChange={(value) => onSettingChange('animationDuration', parseInt(value))}
              >
                <DropdownMenuRadioItem value="0">None</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="200">Fast</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="400">Normal</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="800">Slow</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

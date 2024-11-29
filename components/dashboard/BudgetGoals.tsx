"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
} from "@/components/ui/dropdown-menu";
import { CategoryTotal } from "@/lib/types";

interface BudgetGoal {
  categoryId: string;
  amount: number;
}

interface BudgetGoalSettings {
  isYearlyView: boolean;
  showOverBudgetWarnings: boolean;
  showProgressBars: boolean;
}

interface BudgetGoalsProps {
  categories: CategoryTotal[];
  initialGoals?: BudgetGoal[];
  onSaveGoals?: (goals: BudgetGoal[]) => void;
  settings?: BudgetGoalSettings;
  onSettingsChange?: (settings: BudgetGoalSettings) => void;
}

export default function BudgetGoals({ 
  categories, 
  initialGoals = [], 
  onSaveGoals,
  settings = {
    isYearlyView: false,
    showOverBudgetWarnings: true,
    showProgressBars: true
  },
  onSettingsChange
}: BudgetGoalsProps) {
  const [goals, setGoals] = useState<BudgetGoal[]>(initialGoals);
  const [editMode, setEditMode] = useState(false);

  const handleGoalChange = (categoryId: string, amount: string) => {
    const numAmount = parseFloat(amount) || 0;
    setGoals(prev => {
      const existing = prev.find(g => g.categoryId === categoryId);
      if (existing) {
        return prev.map(g => g.categoryId === categoryId ? { ...g, amount: numAmount } : g);
      }
      return [...prev, { categoryId, amount: numAmount }];
    });
  };

  const handleSave = () => {
    onSaveGoals?.(goals);
    setEditMode(false);
  };

  const handleSettingChange = (key: keyof BudgetGoalSettings) => {
    onSettingsChange?.({
      ...settings,
      [key]: !settings[key]
    });
  };

  const getDisplayAmount = (amount: number) => {
    return settings.isYearlyView ? amount * 12 : amount;
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>
          {settings.isYearlyView ? "Yearly" : "Monthly"} Budget Goals
        </CardTitle>
        <div className="flex items-center space-x-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent hover:text-accent-foreground">
                <Settings2 className="h-4 w-4" />
                <span className="sr-only">Open budget settings</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuLabel>Budget Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleSettingChange("isYearlyView")}>
                {settings.isYearlyView ? "Switch to Monthly View" : "Switch to Yearly View"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSettingChange("showOverBudgetWarnings")}>
                {settings.showOverBudgetWarnings ? "Hide Warnings" : "Show Warnings"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSettingChange("showProgressBars")}>
                {settings.showProgressBars ? "Hide Progress Bars" : "Show Progress Bars"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              if (editMode) {
                handleSave();
              } else {
                setEditMode(true);
              }
            }}
          >
            {editMode ? "Save" : "Edit"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {categories.map((category) => {
            const goal = goals.find(g => g.categoryId === category.category) || { amount: 0 };
            const displayAmount = getDisplayAmount(goal.amount);
            const progress = (category.total / displayAmount) * 100;
            const isOverBudget = progress > 100;
            
            return (
              <div key={category.category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{category.category}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">
                      ${category.total.toFixed(2)} / 
                    </span>
                    {editMode ? (
                      <Input
                        type="number"
                        value={goal.amount}
                        onChange={(e) => handleGoalChange(category.category, e.target.value)}
                        className="w-24 h-6 text-sm"
                      />
                    ) : (
                      <span className="text-sm font-medium">${displayAmount.toFixed(2)}</span>
                    )}
                  </div>
                </div>
                {settings.showProgressBars && (
                  <Progress 
                    value={Math.min(progress, 100)} 
                    className={isOverBudget ? "bg-red-200" : undefined}
                  />
                )}
                {settings.showOverBudgetWarnings && isOverBudget && (
                  <p className="text-xs text-red-500">
                    Over budget by ${(category.total - displayAmount).toFixed(2)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

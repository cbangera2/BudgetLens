"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Transaction } from "@/lib/types";
import { RESET_FILTER_VALUE } from "@/lib/utils/constants";
import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  transactions: Transaction[];
  onCategoryFilter: (includes: string[], excludes: string[]) => void;
  onVendorFilter: (includes: string[], excludes: string[]) => void;
  onTransactionTypeFilter: (includes: string[], excludes: string[]) => void;
  onDateFilter: (startDate: Date | undefined, endDate: Date | undefined) => void;
}

interface SelectionStates {
  [key: string]: 0 | 1 | 2;
}

export function FilterBar({ 
  transactions, 
  onCategoryFilter, 
  onVendorFilter, 
  onTransactionTypeFilter,
  onDateFilter 
}: FilterBarProps) {
  const [categoryStates, setCategoryStates] = useState<SelectionStates>({});
  const [vendorStates, setVendorStates] = useState<SelectionStates>({});
  const [typeStates, setTypeStates] = useState<SelectionStates>({});
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [dateRange, setDateRange] = useState<{ min: Date; max: Date }>(() => {
    if (!transactions.length) {
      return {
        min: new Date(2020, 0, 1),
        max: new Date()
      };
    }
    const dates = transactions.map(t => new Date(t.date));
    return {
      min: new Date(Math.min(...dates.map(d => d.getTime()))),
      max: new Date(Math.max(...dates.map(d => d.getTime())))
    };
  });

  // Set initial date range on component mount
  useEffect(() => {
    if (transactions.length > 0 && !startDate && !endDate && typeof onDateFilter === 'function') {
      const newStartDate = dateRange.min;
      const newEndDate = dateRange.max;
      setStartDate(newStartDate);
      setEndDate(newEndDate);
      onDateFilter(newStartDate, newEndDate);
    }
  }, [dateRange.max, dateRange.min, endDate, onDateFilter, startDate, transactions.length]); // Only run when transactions change

  const categories = Array.from(new Set(transactions.map(t => t.category)));
  const vendors = Array.from(new Set(transactions.map(t => t.vendor)));
  const transactionTypes = Array.from(new Set(transactions.map(t => t.transactionType)));

  const handleStartDateSelect = (date: Date | undefined) => {
    setStartDate(date);
    if (typeof onDateFilter === 'function') {
      if (date && endDate && date > endDate) {
        setEndDate(undefined);
        onDateFilter(date, undefined);
      } else {
        onDateFilter(date, endDate);
      }
    }
  };

  const handleEndDateSelect = (date: Date | undefined) => {
    setEndDate(date);
    if (typeof onDateFilter === 'function') {
      onDateFilter(startDate, date);
    }
  };

  const handleStateChange = (
    states: SelectionStates,
    setStates: (states: SelectionStates) => void,
    onFilter: (includes: string[], excludes: string[]) => void
  ) => (value: string, state: 0 | 1 | 2) => {
    const newStates = { ...states };
    newStates[value] = state;
    
    setStates(newStates);
    
    const includes = Object.entries(newStates)
      .filter(([_, state]) => state === 1)
      .map(([value]) => value);
    const excludes = Object.entries(newStates)
      .filter(([_, state]) => state === 2)
      .map(([value]) => value);
    
    onFilter(includes, excludes);
  };

  const isAllSelected = (states: SelectionStates, items: string[]) => {
    return items.every(item => states[item] === 1);
  };

  const toggleAll = (
    states: SelectionStates,
    setStates: (states: SelectionStates) => void,
    items: string[],
    onFilter: (includes: string[], excludes: string[]) => void
  ) => {
    const allSelected = isAllSelected(states, items);
    const newStates: SelectionStates = {};
    
    items.forEach(item => {
      newStates[item] = allSelected ? 0 : 1;
    });
    
    setStates(newStates);
    onFilter(allSelected ? [] : items, []);
  };

  return (
    <div className="flex gap-4 mb-6">
      {/* Date Range Filter */}
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[180px] justify-start text-left font-normal",
                !startDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, "PPP") : <span>Start Date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={handleStartDateSelect}
              initialFocus
              fromDate={dateRange.min}
              toDate={dateRange.max}
            />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[180px] justify-start text-left font-normal",
                !endDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? format(endDate, "PPP") : <span>End Date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={handleEndDateSelect}
              initialFocus
              fromDate={startDate || dateRange.min}
              toDate={dateRange.max}
              disabled={(date) => startDate ? date < startDate : false}
            />
          </PopoverContent>
        </Popover>

        {(startDate || endDate) && (
          <Button
            variant="ghost"
            className="h-9 px-2"
            onClick={() => {
              setStartDate(undefined);
              setEndDate(undefined);
              onDateFilter(undefined, undefined);
            }}
          >
            Reset
          </Button>
        )}
      </div>

      <Select value="category" onValueChange={() => {}}>
        <SelectTrigger className="w-[180px]" aria-label="Filter by Category">
          <SelectValue>Filter by Category</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            value="__all__"
            selectionState={isAllSelected(categoryStates, categories) ? 1 : 0}
            onMultiStateChange={() => toggleAll(categoryStates, setCategoryStates, categories, onCategoryFilter)}
          >
            Select All
          </SelectItem>
          <SelectSeparator />
          {categories.map(category => (
            <SelectItem
              key={category}
              value={category}
              selectionState={categoryStates[category] || 0}
              onMultiStateChange={handleStateChange(categoryStates, setCategoryStates, onCategoryFilter)}
            >
              {category}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value="vendor" onValueChange={() => {}}>
        <SelectTrigger className="w-[180px]" aria-label="Filter by Vendor">
          <SelectValue>Filter by Vendor</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            value="__all__"
            selectionState={isAllSelected(vendorStates, vendors) ? 1 : 0}
            onMultiStateChange={() => toggleAll(vendorStates, setVendorStates, vendors, onVendorFilter)}
          >
            Select All
          </SelectItem>
          <SelectSeparator />
          {vendors.map(vendor => (
            <SelectItem
              key={vendor}
              value={vendor}
              selectionState={vendorStates[vendor] || 0}
              onMultiStateChange={handleStateChange(vendorStates, setVendorStates, onVendorFilter)}
            >
              {vendor}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value="type" onValueChange={() => {}}>
        <SelectTrigger className="w-[180px]" aria-label="Filter by Type">
          <SelectValue>Filter by Type</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            value="__all__"
            selectionState={isAllSelected(typeStates, transactionTypes) ? 1 : 0}
            onMultiStateChange={() => toggleAll(typeStates, setTypeStates, transactionTypes, onTransactionTypeFilter)}
          >
            Select All
          </SelectItem>
          <SelectSeparator />
          {transactionTypes.map(type => (
            <SelectItem
              key={type}
              value={type}
              selectionState={typeStates[type] || 0}
              onMultiStateChange={handleStateChange(typeStates, setTypeStates, onTransactionTypeFilter)}
            >
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
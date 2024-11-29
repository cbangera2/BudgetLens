"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Transaction } from "@/lib/types";
import { RESET_FILTER_VALUE } from "@/lib/utils/constants";
import { useState } from "react";

interface FilterBarProps {
  transactions: Transaction[];
  onCategoryFilter: (includes: string[], excludes: string[]) => void;
  onVendorFilter: (includes: string[], excludes: string[]) => void;
  onTransactionTypeFilter: (includes: string[], excludes: string[]) => void;
}

interface SelectionStates {
  [key: string]: 0 | 1 | 2;
}

export function FilterBar({ transactions, onCategoryFilter, onVendorFilter, onTransactionTypeFilter }: FilterBarProps) {
  const [categoryStates, setCategoryStates] = useState<SelectionStates>({});
  const [vendorStates, setVendorStates] = useState<SelectionStates>({});
  const [typeStates, setTypeStates] = useState<SelectionStates>({});

  const categories = Array.from(new Set(transactions.map(t => t.category)));
  const vendors = Array.from(new Set(transactions.map(t => t.vendor)));
  const transactionTypes = Array.from(new Set(transactions.map(t => t.transactionType)));

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
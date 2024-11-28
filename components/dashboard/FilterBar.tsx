"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Transaction } from "@/lib/types";
import { RESET_FILTER_VALUE } from "@/lib/utils/constants";

interface FilterBarProps {
  transactions: Transaction[];
  onCategoryFilter: (category: string) => void;
  onVendorFilter: (vendor: string) => void;
  onTransactionTypeFilter: (transactionType: string) => void;
}

export function FilterBar({ transactions, onCategoryFilter, onVendorFilter, onTransactionTypeFilter }: FilterBarProps) {
  const categories = Array.from(new Set(transactions.map(t => t.category)));
  const vendors = Array.from(new Set(transactions.map(t => t.vendor)));
  const transactionTypes = Array.from(new Set(transactions.map(t => t.transactionType)));

  return (
    <div className="flex gap-4 mb-6">
      <Select onValueChange={onCategoryFilter} defaultValue={RESET_FILTER_VALUE}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={RESET_FILTER_VALUE}>All Categories</SelectItem>
          {categories.map(category => (
            <SelectItem key={category} value={category}>
              {category}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select onValueChange={onVendorFilter} defaultValue={RESET_FILTER_VALUE}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Vendor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={RESET_FILTER_VALUE}>All Vendors</SelectItem>
          {vendors.map(vendor => (
            <SelectItem key={vendor} value={vendor}>
              {vendor}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select onValueChange={onTransactionTypeFilter} defaultValue={RESET_FILTER_VALUE}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={RESET_FILTER_VALUE}>All Types</SelectItem>
          {transactionTypes.map(type => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
"use client";

import { Transaction } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TransactionsTableProps {
  transactions: Transaction[];
  onAddTransaction?: (transaction: Transaction) => void;
}

export function TransactionsTable({ transactions, onAddTransaction }: TransactionsTableProps) {
  const [search, setSearch] = useState("");
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [newTransaction, setNewTransaction] = useState<Partial<Transaction>>({
    date: new Date().toISOString().split('T')[0],
    amount: "",
    vendor: "",
    category: "",
    transactionType: ""
  });
  const [openCategory, setOpenCategory] = useState(false);
  const [openType, setOpenType] = useState(false);
  const [openVendor, setOpenVendor] = useState(false);

  const uniqueCategories = Array.from(new Set(transactions.map(t => t.category))).sort();
  const uniqueTypes = Array.from(new Set(transactions.map(t => t.transactionType))).sort();
  const uniqueVendors = Array.from(new Set(transactions.map(t => t.vendor))).sort();

  const handleAddTransaction = () => {
    if (
      newTransaction.date &&
      newTransaction.amount &&
      newTransaction.vendor &&
      newTransaction.category &&
      newTransaction.transactionType
    ) {
      onAddTransaction?.({
        date: newTransaction.date,
        amount: parseFloat(newTransaction.amount as string),
        vendor: newTransaction.vendor,
        category: newTransaction.category,
        transactionType: newTransaction.transactionType
      } as Transaction);
      setIsAddingTransaction(false);
      setNewTransaction({
        date: new Date().toISOString().split('T')[0],
        amount: "",
        vendor: "",
        category: "",
        transactionType: ""
      });
    }
  };

  const handleAddNewCategory = (category: string) => {
    if (category && !uniqueCategories.includes(category)) {
      setNewTransaction(prev => ({ ...prev, category }));
      setOpenCategory(false);
    }
  };

  const handleAddNewType = (type: string) => {
    if (type && !uniqueTypes.includes(type)) {
      setNewTransaction(prev => ({ ...prev, transactionType: type }));
      setOpenType(false);
    }
  };

  const handleAddNewVendor = (vendor: string) => {
    if (vendor && !uniqueVendors.includes(vendor)) {
      setNewTransaction(prev => ({ ...prev, vendor }));
      setOpenVendor(false);
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    const searchTerm = search.toLowerCase();
    return (
      (t.vendor?.toLowerCase() || "").includes(searchTerm) ||
      (t.category?.toLowerCase() || "").includes(searchTerm) ||
      (t.transactionType?.toLowerCase() || "").includes(searchTerm) ||
      (t.amount?.toString() || "").includes(searchTerm) ||
      (t.date?.toLowerCase() || "").includes(searchTerm)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search transactions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Dialog open={isAddingTransaction} onOpenChange={setIsAddingTransaction}>
          <DialogTrigger asChild>
            <Button size="sm">
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Transaction
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Transaction</DialogTitle>
              <DialogDescription>
                Enter the details for your new transaction.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm">Date</label>
                <Input
                  type="date"
                  value={newTransaction.date}
                  onChange={(e) => setNewTransaction(prev => ({ ...prev, date: e.target.value }))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm">Amount</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newTransaction.amount}
                  onChange={(e) => setNewTransaction(prev => ({ ...prev, amount: e.target.value }))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm">Vendor</label>
                <div className="col-span-3">
                  <Popover open={openVendor} onOpenChange={setOpenVendor}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openVendor}
                        className="w-[300px] justify-between"
                      >
                        {newTransaction.vendor || "Select vendor..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command className="max-h-[300px]">
                        <CommandInput placeholder="Search or add new vendor..." />
                        <CommandList className="overflow-y-auto max-h-[200px]">
                          <CommandEmpty>
                            <div className="p-2 text-sm">
                              Press enter to add "{newTransaction.vendor}" as a new vendor
                            </div>
                          </CommandEmpty>
                          <CommandGroup heading="Vendors">
                            {uniqueVendors.map((vendor) => (
                              <CommandItem
                                key={vendor}
                                value={vendor}
                                onSelect={() => {
                                  setNewTransaction(prev => ({ ...prev, vendor }));
                                  setOpenVendor(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    newTransaction.vendor === vendor ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {vendor}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                        <CommandSeparator />
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              if (newTransaction.vendor) {
                                handleAddNewVendor(newTransaction.vendor);
                              }
                            }}
                          >
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add new vendor
                          </CommandItem>
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm">Category</label>
                <div className="col-span-3">
                  <Popover open={openCategory} onOpenChange={setOpenCategory}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCategory}
                        className="w-[300px] justify-between"
                      >
                        {newTransaction.category || "Select category..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command className="max-h-[300px]">
                        <CommandInput placeholder="Search or add new category..." />
                        <CommandList className="overflow-y-auto max-h-[200px]">
                          <CommandEmpty>
                            <div className="p-2 text-sm">
                              Press enter to add "{newTransaction.category}" as a new category
                            </div>
                          </CommandEmpty>
                          <CommandGroup heading="Categories">
                            {uniqueCategories.map((category) => (
                              <CommandItem
                                key={category}
                                value={category}
                                onSelect={() => {
                                  setNewTransaction(prev => ({ ...prev, category }));
                                  setOpenCategory(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    newTransaction.category === category ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {category}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                        <CommandSeparator />
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              if (newTransaction.category) {
                                handleAddNewCategory(newTransaction.category);
                              }
                            }}
                          >
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add new category
                          </CommandItem>
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm">Type</label>
                <div className="col-span-3">
                  <Popover open={openType} onOpenChange={setOpenType}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openType}
                        className="w-[300px] justify-between"
                      >
                        {newTransaction.transactionType || "Select type..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command className="max-h-[300px]">
                        <CommandInput placeholder="Search or add new type..." />
                        <CommandList className="overflow-y-auto max-h-[200px]">
                          <CommandEmpty>
                            <div className="p-2 text-sm">
                              Press enter to add "{newTransaction.transactionType}" as a new type
                            </div>
                          </CommandEmpty>
                          <CommandGroup heading="Types">
                            {uniqueTypes.map((type) => (
                              <CommandItem
                                key={type}
                                value={type}
                                onSelect={() => {
                                  setNewTransaction(prev => ({ ...prev, transactionType: type }));
                                  setOpenType(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    newTransaction.transactionType === type ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {type}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                        <CommandSeparator />
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              if (newTransaction.transactionType) {
                                handleAddNewType(newTransaction.transactionType);
                              }
                            }}
                          >
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add new type
                          </CommandItem>
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddingTransaction(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddTransaction}>Add Transaction</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransactions.map((transaction, i) => (
              <TableRow key={i}>
                <TableCell>{transaction.date}</TableCell>
                <TableCell>{transaction.vendor}</TableCell>
                <TableCell>${transaction.amount.toFixed(2)}</TableCell>
                <TableCell>{transaction.category}</TableCell>
                <TableCell>{transaction.transactionType}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
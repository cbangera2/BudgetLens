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
import { PlusCircle, Pencil, Trash2, Copy } from "lucide-react";
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
  onUpdateTransaction?: (oldTransaction: Transaction, newTransaction: Transaction) => void;
  onDeleteTransaction?: (transaction: Transaction) => void;
}

export function TransactionsTable({ transactions, onAddTransaction, onUpdateTransaction, onDeleteTransaction }: TransactionsTableProps) {
  const [search, setSearch] = useState("");
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [isEditingTransaction, setIsEditingTransaction] = useState(false);
  const [isDeletingTransaction, setIsDeletingTransaction] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [newTransaction, setNewTransaction] = useState<Partial<Transaction>>({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    vendor: "",
    category: "",
    transactionType: ""
  });
  const [openCategory, setOpenCategory] = useState(false);
  const [openType, setOpenType] = useState(false);
  const [openVendor, setOpenVendor] = useState(false);
  const [sortColumn, setSortColumn] = useState<keyof Transaction | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: keyof Transaction) => {
    if (sortColumn === column) {
      // If clicking the same column, toggle direction
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // If clicking a new column, set it as the sort column with ascending order
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

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
        amount: parseFloat(newTransaction.amount as unknown as string),
        vendor: newTransaction.vendor,
        category: newTransaction.category,
        transactionType: newTransaction.transactionType
      } as Transaction);
      setIsAddingTransaction(false);
      setNewTransaction({
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        vendor: "",
        category: "",
        transactionType: ""
      });
    }
  };

  const handleUpdateTransaction = () => {
    if (
      editingTransaction &&
      newTransaction.date &&
      newTransaction.amount &&
      newTransaction.vendor &&
      newTransaction.category &&
      newTransaction.transactionType
    ) {
      onUpdateTransaction?.(editingTransaction, {
        date: newTransaction.date,
        amount: parseFloat(newTransaction.amount as unknown as string),
        vendor: newTransaction.vendor,
        category: newTransaction.category,
        transactionType: newTransaction.transactionType
      } as Transaction);
      setIsEditingTransaction(false);
      setEditingTransaction(null);
      setNewTransaction({
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        vendor: "",
        category: "",
        transactionType: ""
      });
    }
  };

  const handleDeleteConfirm = () => {
    if (transactionToDelete && onDeleteTransaction) {
      onDeleteTransaction(transactionToDelete);
      setTransactionToDelete(null);
      setIsDeletingTransaction(false);
    }
  };

  const startEditing = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setNewTransaction({
      date: transaction.date,
      amount: transaction.amount,
      vendor: transaction.vendor,
      category: transaction.category,
      transactionType: transaction.transactionType
    });
    setIsEditingTransaction(true);
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

  const handleCopyTransaction = (transaction: Transaction) => {
    setNewTransaction({
      date: new Date().toISOString().split('T')[0],
      amount: transaction.amount,
      vendor: transaction.vendor,
      category: transaction.category,
      transactionType: transaction.transactionType
    });
    setIsAddingTransaction(true);
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

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    if (!sortColumn) return 0;

    const aValue = a[sortColumn];
    const bValue = b[sortColumn];

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' 
        ? aValue - bValue
        : bValue - aValue;
    }

    return 0;
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
                <label htmlFor="date" className="text-right text-sm">Date</label>
                <Input
                  id="date"
                  type="date"
                  value={newTransaction.date}
                  onChange={(e) => setNewTransaction(prev => ({ ...prev, date: e.target.value }))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="amount" className="text-right text-sm">Amount</label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newTransaction.amount}
                  onChange={(e) => setNewTransaction(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="vendor" className="text-right text-sm">Vendor</label>
                <div className="col-span-3">
                  <Popover open={openVendor} onOpenChange={setOpenVendor}>
                    <PopoverTrigger asChild>
                      <Button
                        id="vendor"
                        variant="outline"
                        role="combobox"
                        aria-expanded={openVendor}
                        aria-label="Select vendor"
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
                              Press enter to add &quot;{newTransaction.vendor}&quot; as a new vendor
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
                <label htmlFor="category" className="text-right text-sm">Category</label>
                <div className="col-span-3">
                  <Popover open={openCategory} onOpenChange={setOpenCategory}>
                    <PopoverTrigger asChild>
                      <Button
                        id="category"
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCategory}
                        aria-label="Select category"
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
                              Press enter to add &quot;{newTransaction.category}&quot; as a new category
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
                <label htmlFor="type" className="text-right text-sm">Type</label>
                <div className="col-span-3">
                  <Popover open={openType} onOpenChange={setOpenType}>
                    <PopoverTrigger asChild>
                      <Button
                        id="type"
                        variant="outline"
                        role="combobox"
                        aria-expanded={openType}
                        aria-label="Select type"
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
                              Press enter to add &quot;{newTransaction.transactionType}&quot; as a new type
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
              <TableHead 
                className="cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('date')}
              >
                Date {sortColumn === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('vendor')}
              >
                Vendor {sortColumn === 'vendor' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('amount')}
              >
                Amount {sortColumn === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('category')}
              >
                Category {sortColumn === 'category' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('transactionType')}
              >
                Type {sortColumn === 'transactionType' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTransactions.map((transaction, i) => (
              <TableRow key={i}>
                <TableCell>{transaction.date}</TableCell>
                <TableCell>{transaction.vendor}</TableCell>
                <TableCell>${transaction.amount.toFixed(2)}</TableCell>
                <TableCell>{transaction.category}</TableCell>
                <TableCell>{transaction.transactionType}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingTransaction(transaction);
                      setNewTransaction({
                        date: transaction.date,
                        amount: transaction.amount,
                        vendor: transaction.vendor,
                        category: transaction.category,
                        transactionType: transaction.transactionType
                      });
                      setIsEditingTransaction(true);
                    }}
                    className="h-8 w-8 p-0"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopyTransaction(transaction)}
                    className="h-8 w-8 p-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setTransactionToDelete(transaction);
                      setIsDeletingTransaction(true);
                    }}
                    className="h-8 w-8 p-0 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isEditingTransaction} onOpenChange={setIsEditingTransaction}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>
              Update the details for this transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="date" className="text-right text-sm">Date</label>
              <Input
                id="date"
                type="date"
                value={newTransaction.date}
                onChange={(e) => setNewTransaction(prev => ({ ...prev, date: e.target.value }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="amount" className="text-right text-sm">Amount</label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={newTransaction.amount}
                onChange={(e) => setNewTransaction(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="vendor" className="text-right text-sm">Vendor</label>
              <div className="col-span-3">
                <Popover open={openVendor} onOpenChange={setOpenVendor}>
                  <PopoverTrigger asChild>
                    <Button
                      id="vendor"
                      variant="outline"
                      role="combobox"
                      aria-expanded={openVendor}
                      aria-label="Select vendor"
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
                            Press enter to add &quot;{newTransaction.vendor}&quot; as a new vendor
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
              <label htmlFor="category" className="text-right text-sm">Category</label>
              <div className="col-span-3">
                <Popover open={openCategory} onOpenChange={setOpenCategory}>
                  <PopoverTrigger asChild>
                    <Button
                      id="category"
                      variant="outline"
                      role="combobox"
                      aria-expanded={openCategory}
                      aria-label="Select category"
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
                            Press enter to add &quot;{newTransaction.category}&quot; as a new category
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
              <label htmlFor="type" className="text-right text-sm">Type</label>
              <div className="col-span-3">
                <Popover open={openType} onOpenChange={setOpenType}>
                  <PopoverTrigger asChild>
                    <Button
                      id="type"
                      variant="outline"
                      role="combobox"
                      aria-expanded={openType}
                      aria-label="Select type"
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
                            Press enter to add &quot;{newTransaction.transactionType}&quot; as a new type
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
            <Button variant="outline" onClick={() => {
              setIsEditingTransaction(false);
              setEditingTransaction(null);
              setNewTransaction({
                date: new Date().toISOString().split('T')[0],
                amount: 0,
                vendor: "",
                category: "",
                transactionType: ""
              });
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTransaction}>Update Transaction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeletingTransaction} onOpenChange={setIsDeletingTransaction}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Transaction</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this transaction? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeletingTransaction(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
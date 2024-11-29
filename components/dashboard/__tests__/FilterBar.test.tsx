import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar } from "../FilterBar";
import { Transaction } from "@/lib/types";

// Mock browser APIs required by Radix UI
beforeAll(() => {
  // Mock hasPointerCapture
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }

  // Mock scrollIntoView
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
  }

  // Mock ResizeObserver
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // Mock window.HTMLElement.prototype.getBoundingClientRect
  if (!window.HTMLElement.prototype.getBoundingClientRect) {
    window.HTMLElement.prototype.getBoundingClientRect = () => ({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
  }
});

describe("FilterBar", () => {
  const mockTransactions: Transaction[] = [
    {
      date: "2024-01-01",
      amount: 100,
      vendor: "Vendor1",
      category: "Category1",
      transactionType: "Expense",
    },
    {
      date: "2024-01-02",
      amount: 200,
      vendor: "Vendor2",
      category: "Category2",
      transactionType: "Income",
    },
  ];

  const mockOnCategoryFilter = jest.fn();
  const mockOnVendorFilter = jest.fn();
  const mockOnTransactionTypeFilter = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders all filter dropdowns", () => {
    render(
      <FilterBar
        transactions={mockTransactions}
        onCategoryFilter={mockOnCategoryFilter}
        onVendorFilter={mockOnVendorFilter}
        onTransactionTypeFilter={mockOnTransactionTypeFilter}
      />
    );

    expect(screen.getByLabelText("Filter by Category")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by Vendor")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by Type")).toBeInTheDocument();
  });
});

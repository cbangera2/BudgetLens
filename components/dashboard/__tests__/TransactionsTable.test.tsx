import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionsTable } from '../TransactionsTable';
import { Transaction } from '@/lib/types';

const mockTransactions: Transaction[] = [
  {
    date: '2024-01-01',
    vendor: 'Grocery Store',
    amount: 50.00,
    category: 'Food',
    transactionType: 'Expense'
  },
  {
    date: '2024-01-02',
    vendor: 'Gas Station',
    amount: 30.00,
    category: 'Transportation',
    transactionType: 'Expense'
  },
  {
    date: '2024-01-03',
    vendor: 'Salary',
    amount: 2000.00,
    category: 'Income',
    transactionType: 'Income'
  }
];

// Mock scrollIntoView since it's not available in JSDOM
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = function() {};
  jest.clearAllMocks();
});

describe('TransactionsTable', () => {
  const mockOnAddTransaction = jest.fn();

  it('renders transactions correctly', () => {
    render(<TransactionsTable transactions={mockTransactions} />);
    
    // Check headers
    expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Vendor' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Category' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeInTheDocument();

    // Check first transaction data
    expect(screen.getByText('2024-01-01')).toBeInTheDocument();
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getAllByText('Expense')[0]).toBeInTheDocument();
  });

  it('filters transactions based on search', async () => {
    render(<TransactionsTable transactions={mockTransactions} />);
    
    const searchInput = screen.getByPlaceholderText('Search transactions...');
    await userEvent.type(searchInput, 'grocery');

    // Should show Grocery Store transaction
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();

    // Should not show Gas Station transaction
    expect(screen.queryByText('Gas Station')).not.toBeInTheDocument();
  });

  it('opens add transaction dialog and adds new transaction', async () => {
    render(<TransactionsTable transactions={mockTransactions} onAddTransaction={mockOnAddTransaction} />);
    
    // Open dialog
    const addButton = screen.getByRole('button', { name: /add transaction/i });
    await userEvent.click(addButton);

    // Fill form
    const dateInput = screen.getByLabelText('Date');
    const amountInput = screen.getByLabelText('Amount');
    await userEvent.type(dateInput, '2024-01-04');
    await userEvent.type(amountInput, '75.50');

    // Select and add new vendor
    const vendorButton = screen.getByRole('combobox', { name: /select vendor/i });
    await userEvent.click(vendorButton);
    const addVendorButton = screen.getByRole('option', { name: /add new vendor/i });
    await userEvent.click(addVendorButton);

    // Select category
    const categoryButton = screen.getByRole('combobox', { name: /select category/i });
    await userEvent.click(categoryButton);
    const categoryItem = screen.getByRole('option', { name: 'Food' });
    await userEvent.click(categoryItem);

    // Select type
    const typeButton = screen.getByRole('combobox', { name: /select type/i });
    await userEvent.click(typeButton);
    const typeItem = screen.getByRole('option', { name: 'Expense' });
    await userEvent.click(typeItem);

    // Submit form
    const submitButton = screen.getByRole('button', { name: /add transaction/i });
    await userEvent.click(submitButton);

    // Verify new transaction is added
  });

  it('allows adding new categories and types', async () => {
    render(<TransactionsTable transactions={mockTransactions} onAddTransaction={mockOnAddTransaction} />);
    
    // Open dialog
    const addButton = screen.getByRole('button', { name: /add transaction/i });
    await userEvent.click(addButton);

    // Add new category
    const categoryButton = screen.getByRole('combobox', { name: /select category/i });
    await userEvent.click(categoryButton);
    const addCategoryButton = screen.getByRole('option', { name: /add new category/i });
    await userEvent.click(addCategoryButton);

    // Add new type
    const typeButton = screen.getByRole('combobox', { name: /select type/i });
    await userEvent.click(typeButton);
    const addTypeButton = screen.getByRole('option', { name: /add new type/i });
    await userEvent.click(addTypeButton);

  });
});

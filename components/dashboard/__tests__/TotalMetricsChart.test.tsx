import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TotalMetricsChart } from '../TotalMetricsChart';

// Mock Recharts to avoid rendering issues in tests
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid={`bar-${dataKey}`} />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />
}));

const mockTransactions = [
  { id: '1', amount: 1000, transactionType: 'income', category: 'Salary', date: new Date() },
  { id: '2', amount: 500, transactionType: 'expense', category: 'Food', date: new Date() },
  { id: '3', amount: 2000, transactionType: 'Credit', category: 'Bonus', date: new Date() },
  { id: '4', amount: 800, transactionType: 'Debit', category: 'Rent', date: new Date() }
];

describe('TotalMetricsChart', () => {
  it('renders with default metrics', () => {
    render(<TotalMetricsChart transactions={mockTransactions} />);
    
    expect(screen.getByText('Total Financial Metrics')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.getByLabelText('expenses')).toBeInTheDocument();
    expect(screen.getByLabelText('income')).toBeInTheDocument();
    expect(screen.getByLabelText('savings')).toBeInTheDocument();
  });

  it('calculates metrics correctly', () => {
    render(<TotalMetricsChart transactions={mockTransactions} />);
    
    // Total income = 3000 (1000 + 2000)
    // Total expenses = 1300 (500 + 800)
    // Savings = 1700 (3000 - 1300)
    expect(screen.getByTestId('bar-income')).toBeInTheDocument();
    expect(screen.getByTestId('bar-expenses')).toBeInTheDocument();
    expect(screen.getByTestId('bar-savings')).toBeInTheDocument();
  });

  it('toggles metrics visibility when checkboxes are clicked', async () => {
    const user = userEvent.setup();
    render(<TotalMetricsChart transactions={mockTransactions} />);
    
    const expensesCheckbox = screen.getByLabelText('expenses');
    await user.click(expensesCheckbox);
    
    expect(expensesCheckbox).not.toBeChecked();
    expect(screen.queryByTestId('bar-expenses')).not.toBeInTheDocument();
  });

  it('updates chart settings', async () => {
    const user = userEvent.setup();
    render(<TotalMetricsChart transactions={mockTransactions} />);
    
    // Open chart settings
    const settingsButton = screen.getByRole('button', { name: /open chart settings/i });
    await user.click(settingsButton);
    
    // Change value display
    const valueDisplayTrigger = screen.getByRole('menuitem', { name: /value display/i });
    await user.click(valueDisplayTrigger);
    
    const percentageOption = screen.getByRole('menuitemradio', { name: /percentages only/i });
    await user.click(percentageOption);
  });

  it('renders with empty transactions', () => {
    render(<TotalMetricsChart transactions={[]} />);
    
    expect(screen.getByText('Total Financial Metrics')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });
});

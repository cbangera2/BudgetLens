import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetricsCards } from '../MetricsCards';

// Mock DnD functionality
jest.mock('@dnd-kit/core', () => ({
  ...jest.requireActual('@dnd-kit/core'),
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSensor: jest.fn(),
  useSensors: jest.fn(),
}));

jest.mock('@dnd-kit/sortable', () => ({
  ...jest.requireActual('@dnd-kit/sortable'),
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock data
const mockTransactions = [
  { id: '1', amount: 100, vendor: 'Store A', category: 'Food', date: new Date('2024-01-01') },
  { id: '2', amount: 200, vendor: 'Store B', category: 'Entertainment', date: new Date('2024-01-02') },
  { id: '3', amount: 300, vendor: 'Store A', category: 'Food', date: new Date('2024-01-03') }
];

const mockCategories = [
  { category: 'Food', total: 400 },
  { category: 'Entertainment', total: 200 }
];

describe('MetricsCards', () => {
  it('renders default metrics', () => {
    render(<MetricsCards transactions={mockTransactions} categories={mockCategories} />);
    
    expect(screen.getByText('Total Spent')).toBeInTheDocument();
    expect(screen.getByText('$600.00')).toBeInTheDocument(); // Sum of all transactions
    
    expect(screen.getByText('Avg Transaction')).toBeInTheDocument();
    expect(screen.getByText('$200.00')).toBeInTheDocument(); // 600/3
    
    expect(screen.getByText('Highest Category')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('$400.00')).toBeInTheDocument();
  });

  it('allows adding a new metric', async () => {
    const user = userEvent.setup();
    render(<MetricsCards transactions={mockTransactions} categories={mockCategories} />);
    
    // Click add metric button
    await user.click(screen.getByRole('button', { name: /add metric/i }));
    
    // Fill in the form
    await user.type(screen.getByLabelText(/title/i), 'Custom Metric');
    
    // Save the new metric
    await user.click(screen.getByRole('button', { name: /save/i }));
    
    // Verify new metric is added
    expect(screen.getByText('Custom Metric')).toBeInTheDocument();
  });

  it('allows editing a metric', async () => {
    const user = userEvent.setup();
    render(<MetricsCards transactions={mockTransactions} categories={mockCategories} />);
    
    // Find and click edit button for Total Spent metric
    const totalSpentCard = screen.getByText('Total Spent').closest('.group');
    if (!totalSpentCard) throw new Error('Card not found');
    
    // Hover over card to show edit button
    fireEvent.mouseEnter(totalSpentCard);
    
    const editButton = within(totalSpentCard).getByTestId('edit-button');
    await user.click(editButton);
    
    // Edit the title
    const titleInput = screen.getByLabelText(/title/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'New Title');
    
    // Save changes
    await user.click(screen.getByRole('button', { name: /save/i }));
    
    // Verify changes
    expect(screen.getByText('New Title')).toBeInTheDocument();
  });

  it('allows deleting a metric', async () => {
    const user = userEvent.setup();
    render(<MetricsCards transactions={mockTransactions} categories={mockCategories} />);
    
    // Find and click delete button for Total Spent metric
    const totalSpentCard = screen.getByText('Total Spent').closest('.group');
    if (!totalSpentCard) throw new Error('Card not found');
    
    // Hover over card to show delete button
    fireEvent.mouseEnter(totalSpentCard);
    
    const deleteButton = within(totalSpentCard).getAllByRole('button')[1];
    await user.click(deleteButton);
    
    // Verify metric is removed
    expect(screen.queryByText('Total Spent')).not.toBeInTheDocument();
  });

  it('calculates metrics correctly with empty data', () => {
    render(<MetricsCards transactions={[]} categories={[]} />);
    
    // Get Total Spent card and verify its value
    const totalSpentCard = screen.getByText('Total Spent').closest('.group');
    if (!totalSpentCard) throw new Error('Card not found');
    expect(within(totalSpentCard).getByText('$0.00')).toBeInTheDocument();
    
    expect(screen.getByText('No Data')).toBeInTheDocument(); // Highest Category
    expect(screen.getByText('No transactions')).toBeInTheDocument(); // Last Transaction
  });

  it('updates metrics when transactions change', () => {
    const { rerender } = render(
      <MetricsCards transactions={[]} categories={[]} />
    );
    
    // Get Total Spent card
    const totalSpentCard = screen.getByText('Total Spent').closest('.group');
    if (!totalSpentCard) throw new Error('Card not found');
    expect(within(totalSpentCard).getByText('$0.00')).toBeInTheDocument();
    
    // Add a transaction
    rerender(
      <MetricsCards 
        transactions={[{ id: '1', amount: 100, vendor: 'Store A', category: 'Food', date: new Date() }]} 
        categories={[{ category: 'Food', total: 100 }]} 
      />
    );
    
    expect(within(totalSpentCard).getByText('$100.00')).toBeInTheDocument();
  });
});

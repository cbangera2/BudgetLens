import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BudgetGoals from '../BudgetGoals';

// Mock category data
const mockCategories = [
  { category: 'Food', total: 500 },
  { category: 'Transportation', total: 300 },
  { category: 'Entertainment', total: 200 }
];

// Mock initial goals
const mockInitialGoals = [
  { categoryId: 'Food', amount: 600 },
  { categoryId: 'Transportation', amount: 400 }
];

describe('BudgetGoals', () => {
  it('renders with default settings', () => {
    render(<BudgetGoals categories={mockCategories} />);
    
    expect(screen.getByText('Monthly Budget Goals')).toBeInTheDocument();
    mockCategories.forEach(category => {
      expect(screen.getByText(category.category)).toBeInTheDocument();
      expect(screen.getByText(`$${category.total.toFixed(2)} /`)).toBeInTheDocument();
    });
  });

  it('renders with initial goals', () => {
    render(<BudgetGoals categories={mockCategories} initialGoals={mockInitialGoals} />);
    
    expect(screen.getByText('$600.00')).toBeInTheDocument(); // Food goal
    expect(screen.getByText('$400.00')).toBeInTheDocument(); // Transportation goal
    expect(screen.getByText('$0.00')).toBeInTheDocument(); // Entertainment (no initial goal)
  });

  it('allows editing goals', async () => {
    const user = userEvent.setup();
    const onSaveGoals = jest.fn();
    
    render(
      <BudgetGoals 
        categories={mockCategories} 
        initialGoals={mockInitialGoals}
        onSaveGoals={onSaveGoals}
      />
    );
    
    // Enter edit mode
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    
    // Find input for Food category and change value
    const foodInput = screen.getByDisplayValue('600');
    await user.clear(foodInput);
    await user.type(foodInput, '700');
    
    // Save changes
    await user.click(screen.getByRole('button', { name: 'Save' }));
    
    expect(onSaveGoals).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ categoryId: 'Food', amount: 700 })
    ]));
  });

  it('toggles between yearly and monthly views', async () => {
    const user = userEvent.setup();
    const onSettingsChange = jest.fn();
    
    render(
      <BudgetGoals 
        categories={mockCategories} 
        initialGoals={mockInitialGoals}
        settings={{
          isYearlyView: false,
          showOverBudgetWarnings: true,
          showProgressBars: true
        }}
        onSettingsChange={onSettingsChange}
      />
    );
    
    // Open settings menu
    await user.click(screen.getByRole('button', { name: /open budget settings/i }));
    
    // Toggle to yearly view
    await user.click(screen.getByText('Switch to Yearly View'));
    
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      isYearlyView: true
    }));
  });

  it('shows over-budget warnings when applicable', () => {
    const overBudgetCategories = [
      { category: 'Food', total: 700 } // Over the 600 budget
    ];
    
    render(
      <BudgetGoals 
        categories={overBudgetCategories} 
        initialGoals={mockInitialGoals}
        settings={{
          isYearlyView: false,
          showOverBudgetWarnings: true,
          showProgressBars: true
        }}
      />
    );
    
    expect(screen.getByText('Over budget by $100.00')).toBeInTheDocument();
  });

  it('toggles progress bars visibility', async () => {
    const user = userEvent.setup();
    const onSettingsChange = jest.fn();
    
    render(
      <BudgetGoals 
        categories={mockCategories} 
        initialGoals={mockInitialGoals}
        settings={{
          isYearlyView: false,
          showOverBudgetWarnings: true,
          showProgressBars: true
        }}
        onSettingsChange={onSettingsChange}
      />
    );
    
    // Open settings menu
    await user.click(screen.getByRole('button', { name: /open budget settings/i }));
    
    // Toggle progress bars
    await user.click(screen.getByText('Hide Progress Bars'));
    
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      showProgressBars: false
    }));
  });
});

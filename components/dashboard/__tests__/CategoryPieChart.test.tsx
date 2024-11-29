import React from 'react'
import { render, screen } from '@testing-library/react'
import { CategoryPieChart } from '../CategoryPieChart'
import userEvent from '@testing-library/user-event'

// Mock data
const mockTransactions = [
  {
    id: '1',
    date: '2024-01-01',
    amount: 100,
    category: 'Food',
    vendor: 'Restaurant',
    transactionType: 'expense',
    description: 'Lunch'
  },
  {
    id: '2',
    date: '2024-01-02',
    amount: 200,
    category: 'Shopping',
    vendor: 'Mall',
    transactionType: 'expense',
    description: 'Clothes'
  },
  {
    id: '3',
    date: '2024-01-03',
    amount: 500,
    category: 'Salary',
    vendor: 'Company',
    transactionType: 'income',
    description: 'Monthly salary'
  }
]

const mockCategoryTotals = [
  { category: 'Food', total: 100, percentage: 10 },
  { category: 'Shopping', total: 200, percentage: 20 },
  { category: 'Salary', total: 500, percentage: 50 }
]

describe('CategoryPieChart', () => {
  it('renders chart with initial expenses metric', () => {
    render(
      <CategoryPieChart 
        transactions={mockTransactions}
        categoryTotals={mockCategoryTotals}
      />
    )
    
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    expect(screen.getByText(/expenses/i)).toBeInTheDocument()
    expect(screen.getByText(/income/i)).toBeInTheDocument()
  })

  it('toggles metrics when checkboxes are clicked', async () => {
    const user = userEvent.setup()
    render(
      <CategoryPieChart 
        transactions={mockTransactions}
        categoryTotals={mockCategoryTotals}
      />
    )

    // Initially only expenses should be checked
    const expensesCheckbox = screen.getByRole('checkbox', { name: /expenses/i })
    const incomeCheckbox = screen.getByRole('checkbox', { name: /income/i })
    
    expect(expensesCheckbox).toBeChecked()
    expect(incomeCheckbox).not.toBeChecked()

    // Toggle income on
    await user.click(incomeCheckbox)
    expect(incomeCheckbox).toBeChecked()
    expect(expensesCheckbox).toBeChecked()

    // Toggle expenses off
    await user.click(expensesCheckbox)
    expect(expensesCheckbox).not.toBeChecked()
    expect(incomeCheckbox).toBeChecked()
  })

  it('updates chart settings when changed', async () => {
    const user = userEvent.setup()
    render(
      <CategoryPieChart 
        transactions={mockTransactions}
        categoryTotals={mockCategoryTotals}
      />
    )

    // Open settings menu
    const settingsButton = screen.getByRole('button', { name: /open chart settings/i })
    await user.click(settingsButton)

    // Verify settings menu is open
    expect(screen.getByText('Chart Settings')).toBeInTheDocument()

    // Verify pie chart is still rendered
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })

  it('renders empty state when no transactions exist', () => {
    render(
      <CategoryPieChart 
        transactions={[]}
        categoryTotals={[]}
      />
    )

    // Verify pie chart container exists
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    
    // Verify no pie elements are rendered
    expect(screen.queryAllByTestId('cell')).toHaveLength(0)
  })
})

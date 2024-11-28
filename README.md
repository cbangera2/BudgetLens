# BudgetLens - Personal Finance Dashboard

![GitHub stars](https://img.shields.io/github/stars/cbangera2/BudgetLens?style=social)
![GitHub forks](https://img.shields.io/github/forks/cbangera2/BudgetLens?style=social)
![GitHub watchers](https://img.shields.io/github/watchers/cbangera2/BudgetLens?style=social)
![GitHub repo size](https://img.shields.io/github/repo-size/cbangera2/BudgetLens)
![GitHub language count](https://img.shields.io/github/languages/count/cbangera2/BudgetLens)
![GitHub top language](https://img.shields.io/github/languages/top/cbangera2/BudgetLens)
![GitHub last commit](https://img.shields.io/github/last-commit/cbangera2/BudgetLens?color=red)

**BudgetLens** is a modern, interactive financial dashboard built with Next.js and shadcn/ui that helps users visualize and analyze their financial data through intuitive charts and filters.

## Features

- **Credit Karma Integration**: 
  - Compatible with the CSV export from the [Credit Karma Transaction Extractor Chrome Extension](https://github.com/cbangera2/CreditKarmaExtractor) for easy data import
  - Visualize and analyze your Credit Karma transaction history
- **Data Visualization**: 
  - Monthly spending trends chart
  - Category breakdown pie chart
  - Key financial metrics cards
  - Draggable UI elements
- **Transaction Management**:
  - CSV file import support
  - Searchable transaction table
  - Filter by category, vendor, and transaction type

## Getting Started with Credit Karma Data

1. First, use the [Credit Karma Transaction Extractor](https://github.com/cbangera2/CreditKarmaExtractor) Chrome extension to export your transaction data
2. The extension will generate CSV files containing your transaction history
3. Import these CSV files directly into BudgetLens
4. Your Credit Karma transactions will be automatically visualized in the dashboard

## Screenshots

![screencapture-localhost-3000-2024-11-27-20_34_28](https://github.com/user-attachments/assets/c969f8f6-8783-457c-ad2a-c428e6316d8e)

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **UI Components**: shadcn/ui, Tailwind CSS
- **Charts**: Recharts
- **Drag and Drop**: @dnd-kit/core
- **Data Handling**: CSV parsing and manipulation

## Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/cbangera2/BudgetLens.git
   cd BudgetLens
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Run Development Server**:
   ```bash
   npm run dev
   ```

4. **Open Browser**:
   Navigate to `http://localhost:3000`

## Usage

1. **Upload Data**:
   - Use the CSV upload button to import your transaction data
   - Sample data is provided for demonstration

2. **Customize Dashboard**:
   - Drag and drop widgets to arrange your preferred layout
   - Toggle between light and dark modes
   - Use filters to analyze specific transaction types or categories

3. **Analyze Data**:
   - View spending trends over time
   - Analyze category-wise expenditure
   - Search and filter transactions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Todo Features

- [ ] Dark Mode / Light Mode Toggle
- [ ] Date Range Filter for Transactions
- [ ] Export Filtered Data to CSV
- [ ] Multiple Currency Support
- [ ] Budget Goal Setting and Tracking
- [ ] Income vs Expenses Analysis
- [ ] Transaction Categories Management (Add/Edit/Delete)
- [ ] Data Persistence with Database Integration
- [ ] User Authentication
- [ ] Mobile Responsive Optimizations
- [ ] Transaction Import from Multiple Sources (Banks, Credit Cards)
- [ ] Recurring Transaction Detection
- [ ] Custom Dashboard Layouts Save/Load
- [ ] Financial Insights and Recommendations
- [ ] Monthly Budget vs Actual Comparison

## Credits

- Developed by [Chirag Bangera](https://github.com/cbangera2)
- Built with [shadcn/ui](https://ui.shadcn.com/)

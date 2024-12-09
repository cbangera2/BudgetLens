# BudgetLens - Personal Finance Dashboard

![GitHub stars](https://img.shields.io/github/stars/cbangera2/BudgetLens?style=social)
![GitHub forks](https://img.shields.io/github/forks/cbangera2/BudgetLens?style=social)
![GitHub watchers](https://img.shields.io/github/watchers/cbangera2/BudgetLens?style=social)
![GitHub repo size](https://img.shields.io/github/repo-size/cbangera2/BudgetLens)
![GitHub language count](https://img.shields.io/github/languages/count/cbangera2/BudgetLens)
![GitHub top language](https://img.shields.io/github/languages/top/cbangera2/BudgetLens)
![GitHub last commit](https://img.shields.io/github/last-commit/cbangera2/BudgetLens?color=red)
[![Super-Linter](https://github.com/cbangera2/BudgetLens/actions/workflows/super-linter.yml/badge.svg)](https://github.com/marketplace/actions/super-linter)

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
![image](https://github.com/user-attachments/assets/81259dc8-b211-4b16-a9b8-cd5fabb25f7e)


## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **UI Components**: shadcn/ui, Tailwind CSS
- **Charts**: Recharts
- **Drag and Drop**: @dnd-kit/core
- **Data Handling**: CSV parsing and manipulation

## Installation Options

### Option 1: Local Development Setup
1. **Prerequisites**:
   - Node.js 18+
   - PostgreSQL
   - npm or yarn

2. **One-Click Local Setup**:
   ```bash
   # Make the setup script executable (first time only)
   chmod +x setup.sh

   # Run the setup script
   ./setup.sh
   ```

   The setup script will:
   - Check system prerequisites
   - Create `.env` file
   - Install dependencies
   - Setup database (migrations and seed)
   - Start the development server

3. **Manual Setup Alternative**:
   If you prefer manual steps:
   ```bash
   # Install dependencies
   npm install

   # Setup database
   npx prisma generate
   npx prisma migrate dev
   npx prisma db seed

   # Start development server
   npm run dev
   ```

4. **Open Browser**:
   Navigate to `http://localhost:3000`

### Option 2: Docker Deployment (Recommended)

1. **Prerequisites**:
   - Docker
   - Docker Compose

2. **Clone the Repository**:
   ```bash
   git clone https://github.com/cbangera2/BudgetLens.git
   cd BudgetLens
   ```

3. **Configure Environment**:
   - Copy `.env_example` to `.env`
   - *No additional configuration needed* - default credentials are pre-configured

4. **Build and Run with Docker**:
   ```bash
   docker-compose up --build
   ```

   This will:
   - Build the Next.js application
   - Start a PostgreSQL database with default credentials
     * Database: `budget_lens_db`
     * Username: `budget_lens_user`
     * Password: `budget_lens_password`
   - Run database migrations
   - Seed initial data
   - Start the application on `http://localhost:3000`

### Configuration

- **Environment Variables**:
  - `DATABASE_URL`: PostgreSQL connection string
  - `POSTGRES_USER`: Database username
  - `POSTGRES_PASSWORD`: Database password

### Deployment Notes

- The Docker setup includes:
  - Multi-stage build for optimized image
  - Automatic database migrations
  - Database seeding
  - Production-ready configuration

## Troubleshooting

- Ensure Docker is running with sufficient resources
- Check Docker logs for any startup issues
- Verify environment variable configurations

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

- [ ] Export Filtered Data to CSV
- [ ] Multiple Currency Support
- [ ] Income vs Expenses Analysis
- [ ] Transaction Categories Management (Add/Edit/Delete)
- [ ] Data Persistence with Database Integration
- [ ] User Authentication
- [ ] Mobile Responsive Optimizations
- [ ] Recurring Transaction Detection
- [ ] Custom Dashboard Layouts Save/Load
- [ ] Financial Insights and Recommendations

#### Completed
- [x] Dark Mode / Light Mode Toggle (v0.2)
- [x] Date Range Filter for Transactions (v0.2)
- [x] Budget Goal Setting and Tracking (v0.2)
- [x] Add New Transaction UI (v0.2)
- [x] Monthly Budget vs Actual Comparison (v0.2)

## Changelog
### [v0.5] - 12-08-2024
#### Added
- Added docker installation support
- Created install script for local setup
- Fixed TypeScript errors

### [v0.4] - 12-01-2024
#### Added
- Added ability to add new UI elements
- Added ability to create custom graphs (WIP)
- Added Filter Bar and CSV Import as draggable and deletable components
- Added working data labels to graphs
- Added ability to customize label color in graphs
- Added customizable width and height for graphs

### [v0.3] - 11-29-2024
#### Added
- Added dynamic switching between chart types such as Bar (Vertical), Bar (Horizontal), Line, Pie, and Area
- Added better graph color schemes
- Added table enhancements:
  - Sorting functionality for all columns
  - Edit, copy, and delete actions for transactions
- Added test coverage
- Added filtering by date range
- Enhanced financial visualization:
  - Expanded metrics display (expenses, income, savings) across all graphs
  - New monthly financial trends graph for better tracking
- Added delete card functionality

### [v0.2] - 11-28-2024
#### Added
- Added dark mode support with system preference detection
- Enhanced draggable and editable metrics cards
- Customizable graph settings and chart preferences
- Budget goals tracking with progress indicators
- Reorganized UI elements and added draggable cards for improved dashboard layout

### [v0.1] - 11-27-2024
#### Added
- Initial dashboard layout
- Transaction table with search and filters
- CSV import functionality
- Basic charts:
  - Monthly spending trends
  - Category breakdown
  - Key financial metrics

## Related Projects

- [Credit Karma Transaction Extractor](https://github.com/cbangera2/CreditKarmaExtractor) - Chrome extension to export Credit Karma transaction data


## Credits

- Developed by [Chirag Bangera](https://github.com/cbangera2)
- Built with [shadcn/ui](https://ui.shadcn.com/)

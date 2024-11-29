export const RESET_FILTER_VALUE = "all";

export const INITIAL_BUDGET_GOALS = [
  { categoryId: "Food & Dining", amount: 500 },
  { categoryId: "Transportation", amount: 200 },
  { categoryId: "Entertainment", amount: 100 },
  { categoryId: "Shopping", amount: 300 },
  { categoryId: "Bills & Utilities", amount: 400 },
  { categoryId: "Housing", amount: 1500 },
  { categoryId: "Health & Medical", amount: 150 },
  { categoryId: "Health & Fitness", amount: 100 },
  { categoryId: "Education", amount: 250 },
  { categoryId: "Insurance", amount: 200 },
  { categoryId: "Home Improvement", amount: 200 }
];

export const SAMPLE_DATA = `date,vendor,amount,category,transactionType
2024-01-01,Job,2000.00,Job,Credit
2024-01-05,Grocery Store,150.00,Food & Dining,Debit
2024-01-10,Gas Station,60.00,Transportation,Debit
2024-01-12,Netflix,15.99,Entertainment,Debit
2024-01-15,Restaurant,45.00,Food & Dining,Debit
2024-01-18,Amazon,200.00,Shopping,Debit
2024-01-20,Utility Company,90.00,Bills & Utilities,Debit
2024-01-22,Refund,50.00,Refund,Credit
2024-01-25,Rent Payment,1200.00,Housing,Debit
2024-01-28,Pharmacy,25.00,Health & Medical,Debit
2024-02-02,Coffee Shop,5.00,Food & Dining,Debit
2024-02-05,Mobile Phone,70.00,Bills & Utilities,Debit
2024-02-08,Gym Membership,50.00,Health & Fitness,Debit
2024-02-10,Online Course,200.00,Education,Debit
2024-02-12,Car Insurance,125.00,Insurance,Debit
2024-02-15,Hardware Store,75.00,Home Improvement,Debit
2024-02-18,Freelance Work,500.00,Job,Credit
2024-02-20,Supermarket,100.00,Food & Dining,Debit
2024-02-22,Taxi,30.00,Transportation,Debit
2024-02-25,Concert,50.00,Entertainment,Debit
2024-02-28,Clothing Store,150.00,Shopping,Debit
2024-02-28,Side Hustle,150.00,Job,Credit
2024-03-01,Electricity Bill,100.00,Bills & Utilities,Debit
2024-03-05,Water Bill,30.00,Bills & Utilities,Debit
2024-03-05,Refund,25.00,Refund,Credit
2024-03-08,Doctor Visit,75.00,Health & Medical,Debit
2024-03-10,Bookstore,40.00,Education,Debit
2024-03-10,Side Hustle,200.00,Job,Credit
2024-03-12,Home Decor,60.00,Home Improvement,Debit
2024-03-15,Part-time Job,300.00,Job,Credit`;

export const INITIAL_LAYOUT = [
  "metrics",
  "total-metrics",
  "monthly-trends",
  "monthly",
  "categories",
  "transactions",
  "budget-goals"
];
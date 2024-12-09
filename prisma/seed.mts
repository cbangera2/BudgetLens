import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SAMPLE_DATA = `date,vendor,amount,category,transactionType
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

async function seedDatabase() {
  try {
    // Clear existing transactions
    await prisma.transaction.deleteMany();

    // Parse and insert sample data
    const lines = SAMPLE_DATA.trim().split('\n');
    const transactions = lines.slice(1).map(line => {
      const [date, vendor, amount, category, transactionType] = line.split(',').map(item => item.trim());
      return {
        date,
        vendor,
        amount: parseFloat(amount),
        category,
        transactionType
      };
    });

    // Insert transactions
    await prisma.transaction.createMany({
      data: transactions
    });

    console.log('Database seeded successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedDatabase();

export default seedDatabase;

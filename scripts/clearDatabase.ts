// scripts/clearDatabase.ts
const { PrismaClient } = require('@prisma/client');

async function clearDatabase() {
  const prisma = new PrismaClient();

  try {
    // Delete all transactions
    const result = await prisma.transaction.deleteMany();
    console.log(`Deleted ${result.count} transactions successfully`);
  } catch (error) {
    console.error('Error clearing database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase()
  .catch((e) => {
    console.error('Unhandled error:', e);
    process.exit(1);
  });
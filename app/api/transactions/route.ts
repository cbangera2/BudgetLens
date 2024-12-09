import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Transaction } from '@prisma/client';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const transactions = await request.json();
    
    // If it's a single transaction
    if (!Array.isArray(transactions)) {
      const transaction = await prisma.transaction.create({
        data: transactions,
      });
      return NextResponse.json(transaction);
    }
    
    // If it's an array of transactions (CSV import)
    const createdTransactions = await prisma.transaction.createMany({
      data: transactions,
      skipDuplicates: true,
    });
    
    return NextResponse.json(createdTransactions);
  } catch (error) {
    console.error('Error creating transaction(s):', error);
    return NextResponse.json({ error: 'Error creating transaction(s)' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const vendor = searchParams.get('vendor');
    const transactionType = searchParams.get('transactionType');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const where: any = {};
    
    if (category) where.category = category;
    if (vendor) where.vendor = vendor;
    if (transactionType) where.transactionType = transactionType;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json({ error: 'Error fetching transactions' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, ...data } = await request.json();
    const transaction = await prisma.transaction.update({
      where: { id },
      data,
    });
    return NextResponse.json(transaction);
  } catch (error) {
    console.error('Error updating transaction:', error);
    return NextResponse.json({ error: 'Error updating transaction' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 });
    }

    await prisma.transaction.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json({ error: 'Error deleting transaction' }, { status: 500 });
  }
}

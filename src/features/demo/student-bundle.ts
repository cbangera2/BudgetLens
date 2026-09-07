import type { DemoBudgetSeed, DemoGroupSeed } from "@/features/demo/golden-bundle"

import {
  DEMO_AS_OF,
  buildBundleDocument,
  daysBetween,
  isoDate,
  round2,
  type DemoBreakdownRow,
  type DemoBundleTransaction,
  type DemoWealthAccountRow,
} from "./demo-bundle-utils"

export const STUDENT_DEMO_SOURCE_NAME = "budgetlens-demo-student.json"

/** Label used to tag transactions that belong to the student trip group. */
export const STUDENT_TRIP_LABEL = "bus-trip"
export const STUDENT_TRIP_GROUP_NAME = "Spring Bus Trip"

const FINAL_BALANCES = {
  checking: 820.45,
  savings: 2_400,
  brokerage: 1_250,
  creditCards: 420.15,
} as const

const FINAL_NET_WORTH = round2(
  FINAL_BALANCES.checking +
    FINAL_BALANCES.savings +
    FINAL_BALANCES.brokerage -
    FINAL_BALANCES.creditCards,
)
const START_NET_WORTH = 2_840.1
const START_INVESTMENTS = 890
const FINAL_INVESTMENTS = FINAL_BALANCES.brokerage

function buildTransactions(): DemoBundleTransaction[] {
  const rows: DemoBundleTransaction[] = []
  const checking = {
    accountName: "Campus Checking",
    accountType: "CHECKING",
    provider: "Example Bank",
  }
  const savings = {
    accountName: "Campus Savings",
    accountType: "SAVINGS",
    provider: "Example Bank",
  }

  for (const date of daysBetween("2026-01-01", "2026-08-25")) {
    const [, month = 1, day = 1] = date.split("-").map(Number)
    const weekOfMonth = Math.floor((day - 1) / 7)

    if (day === 5 || day === 20) {
      rows.push({
        date,
        description: "Campus Brew Part-Time Pay",
        amount: 680,
        category: "Income",
        transactionType: "credit",
        ...checking,
        labels: ["paycheck"],
        notes: null,
      })
    }
    if (day === 1) {
      rows.push({
        date,
        description: "University Housing Office",
        amount: -650,
        category: "Housing",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "Transfer to Campus Savings",
        amount: -100,
        category: "Transfers",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "Transfer from Campus Checking",
        amount: 100,
        category: "Transfers",
        transactionType: "credit",
        ...savings,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "City Power and Water",
        amount: round2(28 + ((month * 7) % 15)),
        category: "Utilities",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      for (const subscription of [
        { description: "StreamFlix", amount: -15.99 },
        { description: "CloudTunes Music", amount: -11.99 },
        { description: "PixelPlay Pass", amount: -9.99 },
        { description: "StudyNotes Pro", amount: -6.99 },
        { description: "Campus News Digital", amount: -4.99 },
      ]) {
        rows.push({
          date,
          description: subscription.description,
          amount: subscription.amount,
          category: "Subscriptions",
          transactionType: "debit",
          ...checking,
          labels: [],
          notes: null,
        })
      }
      rows.push({
        description: "Example Card Payment",
        amount: -120,
        category: "Credit Card Payment",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
        date,
      })
    }
    if (day % 7 === 3) {
      rows.push({
        date,
        description: "Greenfield Grocers",
        amount: -round2(28 + ((weekOfMonth * 13 + month * 5) % 18)),
        category: "Groceries",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
    }
    if (day % 14 === 9) {
      rows.push({
        date,
        description: "Noodle Box Corner",
        amount: -round2(11 + ((month * 7) % 9)),
        category: "Dining Out",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
    }
    if (day === 10) {
      rows.push({
        date,
        description: "Metro Transit Student Pass",
        amount: -65,
        category: "Transportation",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
    }
    if ((month === 1 || month === 8) && day === 12) {
      rows.push({
        date,
        description: "Campus Bookstore",
        amount: -178.4,
        category: "Education",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: "Semester textbooks",
      })
    }
    if (month % 3 === 0 && day === 20) {
      rows.push({
        date,
        description: "Brokerage Dividend Distribution",
        amount: round2(9 + month),
        category: "Dividends",
        transactionType: "credit",
        accountName: "Brokerage Account",
        accountType: "INVESTMENT",
        provider: "Example Invest",
        labels: [],
        notes: null,
      })
    }
  }

  for (const expense of [
    { day: 4, description: "Gateway Bus Lines", amount: -45 },
    { day: 5, description: "Hostel Harbor Stay", amount: -120 },
    { day: 6, description: "City Museum Pass", amount: -28 },
  ]) {
    rows.push({
      date: isoDate(2026, 4, expense.day),
      description: expense.description,
      amount: expense.amount,
      category: "Travel",
      transactionType: "debit",
      ...checking,
      labels: [STUDENT_TRIP_LABEL],
      notes: "Spring bus trip with roommates",
    })
  }

  return rows.toSorted((left, right) => left.date.localeCompare(right.date))
}

function buildBreakdown(): DemoBreakdownRow[] {
  return [
    {
      asOf: DEMO_AS_OF,
      section: "assets",
      segment: "cash",
      balance: FINAL_BALANCES.checking + FINAL_BALANCES.savings,
      descriptor: "2 accounts",
    },
    {
      asOf: DEMO_AS_OF,
      section: "assets",
      segment: "investments",
      balance: FINAL_BALANCES.brokerage,
      descriptor: "1 account",
    },
    {
      asOf: DEMO_AS_OF,
      section: "debts",
      segment: "creditCards",
      balance: FINAL_BALANCES.creditCards,
      descriptor: "1 card · paid on time",
    },
  ]
}

function buildWealthAccounts(): DemoWealthAccountRow[] {
  return [
    {
      asOf: DEMO_AS_OF,
      accountType: "cash",
      sourceLabel: "Campus Checking (...4821)",
      balance: FINAL_BALANCES.checking,
      descriptor: "Example Bank · student account",
    },
    {
      asOf: DEMO_AS_OF,
      accountType: "cash",
      sourceLabel: "Campus Savings (...9920)",
      balance: FINAL_BALANCES.savings,
      descriptor: "Example Bank · 3.80% APY",
    },
    {
      asOf: DEMO_AS_OF,
      accountType: "investments",
      sourceLabel: "Brokerage Account (...3377)",
      balance: FINAL_BALANCES.brokerage,
      descriptor: "Example Invest · starter portfolio",
    },
  ]
}

function buildStudentBundle() {
  return buildBundleDocument({
    transactions: buildTransactions(),
    netWorthStart: START_NET_WORTH,
    netWorthEnd: FINAL_NET_WORTH,
    investmentsStart: START_INVESTMENTS,
    investmentsEnd: FINAL_INVESTMENTS,
    breakdown: buildBreakdown(),
    wealthAccounts: buildWealthAccounts(),
  })
}

export const STUDENT_DEMO_BUNDLE_JSON = JSON.stringify(buildStudentBundle())

export const STUDENT_DEMO_BUDGETS: DemoBudgetSeed[] = [
  { category: "Groceries", amountMinor: 20_000, period: "monthly" },
  { category: "Dining Out", amountMinor: 8_000, period: "monthly" },
  { category: "Subscriptions", amountMinor: 5_000, period: "monthly" },
  { category: "Transportation", amountMinor: 7_000, period: "monthly" },
]

export const STUDENT_DEMO_GROUPS: DemoGroupSeed[] = [
  {
    name: STUDENT_TRIP_GROUP_NAME,
    description: "Spring bus trip shared with roommates, split two ways.",
    color: "violet",
    startDate: "2026-04-04",
    endDate: "2026-04-06",
    budgetMinor: 25_000,
    archived: false,
  },
  {
    name: "Fall Study Group 2025",
    description: "Last semester's study group, kept for reference.",
    color: "cyan",
    startDate: "2025-09-01",
    endDate: "2025-12-15",
    budgetMinor: 10_000,
    archived: true,
  },
]

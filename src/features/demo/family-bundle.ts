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

export const FAMILY_DEMO_SOURCE_NAME = "budgetlens-demo-family.json"

/** Label used to tag transactions that belong to the family trip group. */
export const FAMILY_TRIP_LABEL = "family-trip"
export const FAMILY_TRIP_GROUP_NAME = "Family Lake House"

const FINAL_BALANCES = {
  checking: 5_230.75,
  savings: 22_400,
  brokerage: 40_200,
  retirement: 118_000,
  property: 320_000,
  creditCards: 2_140.3,
  autoLoan: 12_500,
  mortgage: 240_000,
} as const

const FINAL_NET_WORTH =
  FINAL_BALANCES.checking +
  FINAL_BALANCES.savings +
  FINAL_BALANCES.brokerage +
  FINAL_BALANCES.retirement +
  FINAL_BALANCES.property -
  FINAL_BALANCES.creditCards -
  FINAL_BALANCES.autoLoan -
  FINAL_BALANCES.mortgage

const START_NET_WORTH = 225_000
const START_INVESTMENTS = 135_000
const FINAL_INVESTMENTS = FINAL_BALANCES.brokerage + FINAL_BALANCES.retirement

function buildTransactions(): DemoBundleTransaction[] {
  const rows: DemoBundleTransaction[] = []
  const checking = {
    accountName: "Family Checking",
    accountType: "CHECKING",
    provider: "Example Bank",
  }
  const savings = {
    accountName: "Family Savings",
    accountType: "SAVINGS",
    provider: "Example Bank",
  }

  for (const date of daysBetween("2026-01-01", "2026-08-25")) {
    const [, month = 1, day = 1] = date.split("-").map(Number)
    const weekOfMonth = Math.floor((day - 1) / 7)

    if (day === 15) {
      rows.push({
        date,
        description: "Acme Corp Payroll",
        amount: 4_200,
        category: "Income",
        transactionType: "credit",
        ...checking,
        labels: ["paycheck"],
        notes: null,
      })
    }
    if (day === 30) {
      rows.push({
        date,
        description: "City Schools Payroll",
        amount: 2_800,
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
        description: "Maple Court Property Management",
        amount: -2_200,
        category: "Housing",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "Little Acorns Daycare",
        amount: -900,
        category: "Childcare",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "Transfer to Family Savings",
        amount: -800,
        category: "Transfers",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "Transfer from Family Checking",
        amount: 800,
        category: "Transfers",
        transactionType: "credit",
        ...savings,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "City Power and Water",
        amount: round2(168 + ((month * 13) % 48)),
        category: "Utilities",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "StreamFlix",
        amount: -15.99,
        category: "Subscriptions",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "CloudTunes Music",
        amount: -11.99,
        category: "Subscriptions",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "StoryTime Kids",
        amount: -7.99,
        category: "Subscriptions",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        description: "Example Card Payment",
        amount: -450,
        category: "Credit Card Payment",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
        date,
      })
      rows.push({
        date,
        description: "Northgate Auto Finance",
        amount: -420,
        category: "Auto Loan",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
    }
    if (day === 14) {
      rows.push({
        date,
        description: "BulkMart Warehouse",
        amount: -round2(290 + ((month * 17) % 60)),
        category: "Groceries",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: "Monthly stock-up",
      })
    }
    if (day % 4 === 1 || day % 4 === 3) {
      rows.push({
        date,
        description: "Greenfield Grocers",
        amount: -round2(110 + ((weekOfMonth * 19 + month * 9) % 52)),
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
        description: "Bella Notte Trattoria",
        amount: -round2(52 + ((month * 11) % 31)),
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
        description: "Metro Transit Pass",
        amount: -127,
        category: "Transportation",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "School Bus Fees",
        amount: -80,
        category: "Transportation",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
    }
    if (month % 3 === 0 && day === 20) {
      rows.push({
        date,
        description: "Brokerage Dividend Distribution",
        amount: round2(72 + month * 4),
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
    { day: 8, description: "Skyway Airlines", amount: -820 },
    { day: 9, description: "Harborview Hotel", amount: -980 },
    { day: 10, description: "Lakeside Grocery Run", amount: -186.4 },
    { day: 11, description: "Lighthouse Tours", amount: -112.5 },
  ]) {
    rows.push({
      date: isoDate(2026, 7, expense.day),
      description: expense.description,
      amount: expense.amount,
      category: "Travel",
      transactionType: "debit",
      ...checking,
      labels: [FAMILY_TRIP_LABEL],
      notes: "Family week at the lake house",
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
      balance: FINAL_BALANCES.brokerage + FINAL_BALANCES.retirement,
      descriptor: "2 accounts",
    },
    {
      asOf: DEMO_AS_OF,
      section: "assets",
      segment: "property",
      balance: FINAL_BALANCES.property,
      descriptor: "1 property",
    },
    {
      asOf: DEMO_AS_OF,
      section: "debts",
      segment: "creditCards",
      balance: FINAL_BALANCES.creditCards,
      descriptor: "1 card · paid on time",
    },
    {
      asOf: DEMO_AS_OF,
      section: "debts",
      segment: "loans",
      balance: FINAL_BALANCES.autoLoan + FINAL_BALANCES.mortgage,
      descriptor: "2 loans",
    },
  ]
}

function buildWealthAccounts(): DemoWealthAccountRow[] {
  return [
    {
      asOf: DEMO_AS_OF,
      accountType: "cash",
      sourceLabel: "Family Checking (...4821)",
      balance: FINAL_BALANCES.checking,
      descriptor: "Example Bank · active today",
    },
    {
      asOf: DEMO_AS_OF,
      accountType: "cash",
      sourceLabel: "Family Savings (...9920)",
      balance: FINAL_BALANCES.savings,
      descriptor: "Example Bank · 4.10% APY",
    },
    {
      asOf: DEMO_AS_OF,
      accountType: "investments",
      sourceLabel: "Brokerage Account (...3377)",
      balance: FINAL_BALANCES.brokerage,
      descriptor: "Example Invest · updated 2 hr ago",
    },
    {
      asOf: DEMO_AS_OF,
      accountType: "investments",
      sourceLabel: "Retirement 401(k) (...5502)",
      balance: FINAL_BALANCES.retirement,
      descriptor: "Meridian Workplace Plan",
    },
    {
      asOf: DEMO_AS_OF,
      accountType: "property",
      sourceLabel: "House at Maple Court",
      balance: FINAL_BALANCES.property,
      descriptor: "Estimated · purchased 2021",
    },
  ]
}

function buildFamilyBundle() {
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

export const FAMILY_DEMO_BUNDLE_JSON = JSON.stringify(buildFamilyBundle())

export const FAMILY_DEMO_BUDGETS: DemoBudgetSeed[] = [
  { category: "Groceries", amountMinor: 90_000, period: "monthly" },
  { category: "Childcare", amountMinor: 95_000, period: "monthly" },
  { category: "Transportation", amountMinor: 30_000, period: "monthly" },
  { category: "Travel", amountMinor: 300_000, period: "yearly" },
]

export const FAMILY_DEMO_GROUPS: DemoGroupSeed[] = [
  {
    name: FAMILY_TRIP_GROUP_NAME,
    description: "Shared lake-house week costs, split two ways.",
    color: "emerald",
    startDate: "2026-07-08",
    endDate: "2026-07-12",
    budgetMinor: 200_000,
    archived: false,
  },
  {
    name: "Grandparents Visit 2025",
    description: "Last winter's visit, kept for reference.",
    color: "orange",
    startDate: "2025-12-20",
    endDate: "2025-12-27",
    budgetMinor: 60_000,
    archived: true,
  },
]

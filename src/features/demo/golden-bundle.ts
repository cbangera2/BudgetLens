import type { WealthAccountType, WealthSection, WealthSegment } from "@/domain/models"

export const DEMO_SOURCE_NAME = "budgetlens-demo.json"

interface DemoBundleTransaction {
  date: string
  description: string
  amount: number
  category: string
  transactionType: "debit" | "credit"
  accountName: string
  accountType: string
  provider: string
  labels: string[]
  notes: string | null
}

const RANGE_START = "2026-01-01"
const RANGE_END = "2026-08-25"
const AS_OF = RANGE_END

function isoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`
}

function daysBetween(start: string, end: string): string[] {
  const dates: string[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (
    cursor.getUTCFullYear() < last.getUTCFullYear() ||
    cursor.getUTCMonth() < last.getUTCMonth() ||
    cursor.getUTCDate() < last.getUTCDate()
  ) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  dates.push(end)
  return dates
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function buildSeries(startValue: number, endValue: number): { date: string; value: number }[] {
  const dates = daysBetween(RANGE_START, RANGE_END)
  const span = dates.length - 1
  return dates.map((date, index) => {
    if (index === span) return { date, value: endValue }
    const progress = index / span
    const wobble = Math.sin(progress * Math.PI * 9) * startValue * 0.004
    return {
      date,
      value: round2(startValue + (endValue - startValue) * progress + wobble),
    }
  })
}

// Final balances chosen so assets minus debts equals the final net worth point below.
const FINAL_BALANCES = {
  checking: 4_280.55,
  savings: 16_400,
  brokerage: 38_215.1,
  retirement: 102_850,
  property: 285_000,
  creditCards: 1_842.77,
  autoLoan: 9_650,
  mortgage: 212_400,
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

const START_NET_WORTH = 205_400.12
const START_INVESTMENTS = 118_640.55
const FINAL_INVESTMENTS = FINAL_BALANCES.brokerage + FINAL_BALANCES.retirement

function buildTransactions(): DemoBundleTransaction[] {
  const rows: DemoBundleTransaction[] = []
  const checking = {
    accountName: "Everyday Checking",
    accountType: "CHECKING",
    provider: "Example Bank",
  }
  const savings = {
    accountName: "High-Yield Savings",
    accountType: "SAVINGS",
    provider: "Example Bank",
  }

  for (const date of daysBetween("2026-01-01", "2026-08-25")) {
    const [, month = 1, day = 1] = date.split("-").map(Number)
    const weekOfMonth = Math.floor((day - 1) / 7)

    if (day === 15 || day === 30) {
      rows.push({
        date,
        description: "Acme Corp Payroll",
        amount: 3_150,
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
        amount: -1_650,
        category: "Housing",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "Transfer to High-Yield Savings",
        amount: -500,
        category: "Transfers",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "Transfer from Everyday Checking",
        amount: 500,
        category: "Transfers",
        transactionType: "credit",
        ...savings,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "City Power and Water",
        amount: round2(96 + ((month * 13) % 41)),
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
        description: "Example Card Payment",
        amount: -220,
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
        amount: -386.51,
        category: "Auto Loan",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
    }
    if (day % 7 === 3) {
      rows.push({
        date,
        description: "Greenfield Grocers",
        amount: -round2(82 + ((weekOfMonth * 17 + month * 7) % 29)),
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
        amount: -round2(38 + ((month * 11) % 27)),
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
    }
    if (month % 3 === 0 && day === 20) {
      rows.push({
        date,
        description: "Brokerage Dividend Distribution",
        amount: round2(61 + month * 4),
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

  // A summer trip so travel spending shows up in charts and budgets.
  for (const expense of [
    { day: 8, description: "Skyway Airlines", amount: -412.4 },
    { day: 9, description: "Harborview Hotel", amount: -689 },
    { day: 10, description: "Coastal Bike Rental", amount: -84.5 },
    { day: 11, description: "Lighthouse Tours", amount: -56.25 },
  ]) {
    rows.push({
      date: isoDate(2026, 7, expense.day),
      description: expense.description,
      amount: expense.amount,
      category: "Travel",
      transactionType: "debit",
      ...checking,
      labels: ["trip"],
      notes: "Summer trip to the coast",
    })
  }

  return rows.toSorted((left, right) => left.date.localeCompare(right.date))
}

interface DemoBreakdownRow {
  asOf: string
  section: WealthSection
  segment: WealthSegment
  balance: number
  descriptor: string
}

function buildBreakdown(): DemoBreakdownRow[] {
  return [
    {
      asOf: AS_OF,
      section: "assets",
      segment: "cash",
      balance: FINAL_BALANCES.checking + FINAL_BALANCES.savings,
      descriptor: "2 accounts",
    },
    {
      asOf: AS_OF,
      section: "assets",
      segment: "investments",
      balance: FINAL_BALANCES.brokerage + FINAL_BALANCES.retirement,
      descriptor: "2 accounts",
    },
    {
      asOf: AS_OF,
      section: "assets",
      segment: "property",
      balance: FINAL_BALANCES.property,
      descriptor: "1 property",
    },
    {
      asOf: AS_OF,
      section: "debts",
      segment: "creditCards",
      balance: FINAL_BALANCES.creditCards,
      descriptor: "1 card · paid on time",
    },
    {
      asOf: AS_OF,
      section: "debts",
      segment: "loans",
      balance: FINAL_BALANCES.autoLoan + FINAL_BALANCES.mortgage,
      descriptor: "2 loans",
    },
  ]
}

interface DemoWealthAccountRow {
  asOf: string
  accountType: WealthAccountType
  sourceLabel: string
  balance: number
  descriptor: string
}

function buildWealthAccounts(): DemoWealthAccountRow[] {
  return [
    {
      asOf: AS_OF,
      accountType: "cash",
      sourceLabel: "Everyday Checking (...4821)",
      balance: FINAL_BALANCES.checking,
      descriptor: "Example Bank · active today",
    },
    {
      asOf: AS_OF,
      accountType: "cash",
      sourceLabel: "High-Yield Savings (...9920)",
      balance: FINAL_BALANCES.savings,
      descriptor: "Example Bank · 4.10% APY",
    },
    {
      asOf: AS_OF,
      accountType: "investments",
      sourceLabel: "Brokerage Account (...3377)",
      balance: FINAL_BALANCES.brokerage,
      descriptor: "Example Invest · updated 2 hr ago",
    },
    {
      asOf: AS_OF,
      accountType: "investments",
      sourceLabel: "Retirement 401(k) (...5502)",
      balance: FINAL_BALANCES.retirement,
      descriptor: "Meridian Workplace Plan",
    },
    {
      asOf: AS_OF,
      accountType: "property",
      sourceLabel: "Condo at Maple Court",
      balance: FINAL_BALANCES.property,
      descriptor: "Estimated · purchased 2023",
    },
  ]
}

function buildGoldenBundle() {
  return {
    format: "budgetlens" as const,
    version: 1 as const,
    exportedAt: `${AS_OF}T12:00:00.000Z`,
    dateRange: { start: RANGE_START, end: RANGE_END },
    transactions: buildTransactions(),
    netWorthHistory: buildSeries(START_NET_WORTH, FINAL_NET_WORTH),
    investmentHistory: buildSeries(START_INVESTMENTS, FINAL_INVESTMENTS),
    netWorthBreakdown: buildBreakdown(),
    wealthAccounts: buildWealthAccounts(),
  }
}

export const GOLDEN_DEMO_BUNDLE_JSON = JSON.stringify(buildGoldenBundle())

export interface DemoBudgetSeed {
  category: string
  amountMinor: number
  period: "monthly" | "yearly"
}

export const GOLDEN_DEMO_BUDGETS: DemoBudgetSeed[] = [
  { category: "Groceries", amountMinor: 48_000, period: "monthly" },
  { category: "Dining Out", amountMinor: 16_000, period: "monthly" },
  { category: "Transportation", amountMinor: 18_000, period: "monthly" },
  { category: "Travel", amountMinor: 120_000, period: "yearly" },
]

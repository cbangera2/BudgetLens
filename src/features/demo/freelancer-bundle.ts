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

export const FREELANCER_DEMO_SOURCE_NAME = "budgetlens-demo-freelancer.json"

/** Label used to tag transactions that belong to the freelancer onsite group. */
export const FREELANCER_TRIP_LABEL = "onsite"
export const FREELANCER_TRIP_GROUP_NAME = "Austin Client Onsite"

const FINAL_BALANCES = {
  checking: 6_450.2,
  savings: 18_200,
  brokerage: 25_400,
  retirement: 62_000,
  creditCards: 980.5,
} as const

const FINAL_NET_WORTH =
  FINAL_BALANCES.checking +
  FINAL_BALANCES.savings +
  FINAL_BALANCES.brokerage +
  FINAL_BALANCES.retirement -
  FINAL_BALANCES.creditCards
const START_NET_WORTH = 92_000
const START_INVESTMENTS = 78_200
const FINAL_INVESTMENTS = FINAL_BALANCES.brokerage + FINAL_BALANCES.retirement

const CLIENT_PAYOUTS: { date: string; description: string; amount: number }[] = [
  { date: "2026-01-08", description: "Bluebird Design Invoice", amount: 4_200 },
  { date: "2026-02-14", description: "Northwind Studio Payout", amount: 2_850 },
  { date: "2026-03-07", description: "Harbor App Contract", amount: 5_100 },
  { date: "2026-04-18", description: "Bluebird Design Invoice", amount: 1_900 },
  { date: "2026-05-22", description: "Northwind Studio Payout", amount: 6_300 },
  { date: "2026-06-11", description: "Harbor App Contract", amount: 3_400 },
  { date: "2026-07-16", description: "Bluebird Design Invoice", amount: 4_800 },
  { date: "2026-08-09", description: "Harbor App Contract", amount: 2_950 },
]

function buildTransactions(): DemoBundleTransaction[] {
  const rows: DemoBundleTransaction[] = []
  const checking = {
    accountName: "Freelance Checking",
    accountType: "CHECKING",
    provider: "Example Bank",
  }
  const savings = {
    accountName: "Tax Reserve Savings",
    accountType: "SAVINGS",
    provider: "Example Bank",
  }

  for (const payout of CLIENT_PAYOUTS) {
    rows.push({
      date: payout.date,
      description: payout.description,
      amount: payout.amount,
      category: "Income",
      transactionType: "credit",
      ...checking,
      labels: ["client-income"],
      notes: null,
    })
  }

  for (const date of daysBetween("2026-01-01", "2026-08-25")) {
    const [, month = 1, day = 1] = date.split("-").map(Number)
    const weekOfMonth = Math.floor((day - 1) / 7)

    if (day === 1) {
      rows.push({
        date,
        description: "Maple Court Property Management",
        amount: -1_450,
        category: "Housing",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "Harbor Cowork Loft",
        amount: -250,
        category: "Business",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "Transfer to Tax Reserve Savings",
        amount: -800,
        category: "Transfers",
        transactionType: "debit",
        ...checking,
        labels: ["tax-reserve"],
        notes: "Quarterly tax set-aside",
      })
      rows.push({
        date,
        description: "Transfer from Freelance Checking",
        amount: 800,
        category: "Transfers",
        transactionType: "credit",
        ...savings,
        labels: ["tax-reserve"],
        notes: "Quarterly tax set-aside",
      })
      rows.push({
        date,
        description: "City Power and Water",
        amount: round2(82 + ((month * 11) % 33)),
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
        description: "InvoiceFlow",
        amount: -15,
        category: "Business Software",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        date,
        description: "PixelPress Pro",
        amount: -29,
        category: "Business Software",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
      rows.push({
        description: "Example Card Payment",
        amount: -300,
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
        amount: -round2(68 + ((weekOfMonth * 11 + month * 5) % 27)),
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
        amount: -round2(32 + ((month * 9) % 24)),
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
        amount: -96,
        category: "Transportation",
        transactionType: "debit",
        ...checking,
        labels: [],
        notes: null,
      })
    }
    if ((month === 4 || month === 6) && day === 15) {
      rows.push({
        date,
        description: "State Tax Authority",
        amount: -2_100,
        category: "Taxes",
        transactionType: "debit",
        ...checking,
        labels: ["tax-reserve"],
        notes: "Quarterly estimated payment",
      })
    }
    if (month % 3 === 0 && day === 20) {
      rows.push({
        date,
        description: "Brokerage Dividend Distribution",
        amount: round2(48 + month * 3),
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
    { day: 21, description: "Skyway Airlines", amount: -380 },
    { day: 22, description: "Harborview Hotel", amount: -520 },
    { day: 23, description: "Downtown Deli Counter", amount: -46.2 },
  ]) {
    rows.push({
      date: isoDate(2026, 7, expense.day),
      description: expense.description,
      amount: expense.amount,
      category: "Travel",
      transactionType: "debit",
      ...checking,
      labels: [FREELANCER_TRIP_LABEL],
      notes: "Client onsite in Austin",
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
      sourceLabel: "Freelance Checking (...4821)",
      balance: FINAL_BALANCES.checking,
      descriptor: "Example Bank · active today",
    },
    {
      asOf: DEMO_AS_OF,
      accountType: "cash",
      sourceLabel: "Tax Reserve Savings (...9920)",
      balance: FINAL_BALANCES.savings,
      descriptor: "Example Bank · tax bucket",
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
      sourceLabel: "Retirement Solo 401(k) (...5502)",
      balance: FINAL_BALANCES.retirement,
      descriptor: "Meridian Workplace Plan",
    },
  ]
}

function buildFreelancerBundle() {
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

export const FREELANCER_DEMO_BUNDLE_JSON = JSON.stringify(buildFreelancerBundle())

export const FREELANCER_DEMO_BUDGETS: DemoBudgetSeed[] = [
  { category: "Groceries", amountMinor: 50_000, period: "monthly" },
  { category: "Taxes", amountMinor: 120_000, period: "monthly" },
  { category: "Business Software", amountMinor: 10_000, period: "monthly" },
  { category: "Travel", amountMinor: 150_000, period: "yearly" },
]

export const FREELANCER_DEMO_GROUPS: DemoGroupSeed[] = [
  {
    name: FREELANCER_TRIP_GROUP_NAME,
    description: "Client onsite costs in Austin, split two ways.",
    color: "amber",
    startDate: "2026-07-21",
    endDate: "2026-07-23",
    budgetMinor: 120_000,
    archived: false,
  },
  {
    name: "Q1 Tax Reserve",
    description: "First quarter estimated-tax bucket, kept for reference.",
    color: "blue",
    startDate: "2026-01-01",
    endDate: "2026-03-31",
    budgetMinor: 300_000,
    archived: true,
  },
]

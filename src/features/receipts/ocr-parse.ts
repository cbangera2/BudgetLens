// Receipt OCR candidate parsing: merchant / total / date from raw OCR lines.
//
// The OCR engine (Apple Vision via @capacitor-community/image-to-text on
// native, see lib/native.ts) returns unordered line strings with no field
// labels. This module is the pure, platform-free heuristic that turns those
// lines into transaction-draft candidates. Every candidate carries an
// explicit confidence (0..1) plus the exact source spans that produced it,
// so the UI can show its work and flag low-confidence fields instead of
// silently storing a guess. Nothing here touches storage: the caller builds
// a DRAFT, the user confirms it in the transaction form, and only the form
// submit writes anything.

export type OcrConfidenceLevel = "high" | "medium" | "low" | "missing"

export interface OcrFieldCandidate<T> {
  /** Parsed value, or null when no usable span was found. */
  value: T | null
  /** 0..1. 0 when value is null. */
  confidence: number
  level: OcrConfidenceLevel
  /** Exact source text spans that produced the value (show-your-work). */
  spans: readonly string[]
  /** One-line explanation of how the value (or its absence) was derived. */
  note: string
}

export interface ReceiptOcrCandidates {
  /** Store name guess (first content line). */
  merchant: OcrFieldCandidate<string>
  /** Total guess in minor units, NEGATIVE (receipts are expenses). */
  amountMinor: OcrFieldCandidate<number>
  /** Transaction date guess as YYYY-MM-DD. */
  date: OcrFieldCandidate<string>
  /** True when any field is missing or below the review threshold. */
  lowConfidence: boolean
  /** Number of non-empty OCR lines that were considered. */
  lineCount: number
}

/** Below this confidence a field needs explicit user review. */
export const OCR_REVIEW_THRESHOLD = 0.6

function levelOf(confidence: number, hasValue: boolean): OcrConfidenceLevel {
  if (!hasValue) return "missing"
  if (confidence >= 0.8) return "high"
  if (confidence >= OCR_REVIEW_THRESHOLD) return "medium"
  return "low"
}

function missing<T = never>(note: string): OcrFieldCandidate<T> {
  return { value: null, confidence: 0, level: "missing", spans: [], note }
}

// ---------------------------------------------------------------------------
// Amounts: currency/decimal variants ($1,234.56, 12,34, 1 234.56, GBP 5.00).
// ---------------------------------------------------------------------------

const TOTAL_KEYWORDS =
  /\b(grand\s+total|order\s+total|total|amount\s+due|balance\s+due|total\s+due|net\s+total|payment\s+due)\b/i
const TOTAL_EXCLUSIONS =
  /\b(sub\s?-?\s?total|savings|change|discount|cash|tendered|tax|tip|gratuity|refund|balance\s+forward)\b/i

interface MoneyMatch {
  minor: number
  token: string
}

/**
 * Parse the LAST money-like token in a line into minor units. Handles dot
 * and comma decimals ("18.50", "18,50"), thousands separators ("1,234.56",
 * "1.234,56", "1 234.56"), and optional currency affixes ($, USD, EUR, GBP,
 * ...). Returns null when no token parses.
 */
export function parseMoneyToken(line: string): MoneyMatch | null {
  const tokenPattern = /(?:[$€£¥₹]\s*)?-?\d[\d\s.,]*\d(?:\s*(?:USD|EUR|GBP|CAD|AUD|\$))?/g
  const rawTokens = line.match(tokenPattern) ?? []
  for (let index = rawTokens.length - 1; index >= 0; index -= 1) {
    const token = (rawTokens[index] ?? "").trim()
    const minor = moneyTokenToMinor(token)
    if (minor !== null) return { minor, token }
  }
  return null
}

function moneyTokenToMinor(token: string): number | null {
  const negative = token.trimStart().startsWith("-")
  const compact = token.replaceAll(/[^\d.,]/g, "").replaceAll(" ", "")
  if (!compact) return null
  const digits = compact.replaceAll(/[.,]/g, "")
  if (!/^\d+$/.test(digits)) return null
  const lastDot = compact.lastIndexOf(".")
  const lastComma = compact.lastIndexOf(",")
  let minor: number
  if (lastDot !== -1 && lastComma !== -1) {
    // Both separators: the rightmost is the decimal mark.
    const decimalAt = Math.max(lastDot, lastComma)
    const fraction = compact.slice(decimalAt + 1)
    if (fraction.length !== 2) return null
    minor = Number.parseInt(digits, 10)
  } else if (lastComma !== -1) {
    const groups = compact.split(",")
    const tail = groups[groups.length - 1] ?? ""
    if (groups.length === 2 && tail.length === 2) {
      // Comma decimal ("18,50").
      minor = Number.parseInt(digits, 10)
    } else if (groups.length === 2 && tail.length === 1) {
      // Comma tenths ("18,5").
      minor = Number.parseInt(digits, 10) * 10
    } else if (groups.slice(1).every((group) => group.length === 3)) {
      // Comma thousands ("1,234" or "1,234,567").
      minor = Number.parseInt(digits, 10) * 100
    } else {
      return null
    }
  } else if (lastDot !== -1) {
    const fraction = compact.slice(lastDot + 1)
    if (fraction.length === 2) {
      minor = Number.parseInt(digits, 10)
    } else if (fraction.length === 1) {
      minor = Number.parseInt(digits, 10) * 10
    } else if (fraction.length === 3 && compact.indexOf(".") === lastDot) {
      // Dot thousands ("1.234").
      minor = Number.parseInt(digits, 10) * 100
    } else {
      return null
    }
  } else {
    // Whole units ("42").
    minor = Number.parseInt(digits, 10) * 100
  }
  if (!Number.isSafeInteger(minor) || minor <= 0) return null
  return negative ? -minor : minor
}

function parseTotal(lines: readonly string[]): OcrFieldCandidate<number> {
  const keywordHits: { minor: number; line: string }[] = []
  const fallbackHits: { minor: number; line: string }[] = []
  for (const line of lines) {
    // Dates ("2026-08-15") and times ("10:24 AM") are numeric but never
    // money: strip them so their fragments cannot become fallback totals.
    const match = parseMoneyToken(stripDatesAndTimes(line))
    if (!match) continue
    const amount = Math.abs(match.minor)
    if (TOTAL_KEYWORDS.test(line) && !TOTAL_EXCLUSIONS.test(line)) {
      keywordHits.push({ minor: amount, line })
    } else if (!TOTAL_EXCLUSIONS.test(line)) {
      fallbackHits.push({ minor: amount, line })
    }
  }
  if (keywordHits.length > 0) {
    const best = keywordHits.reduce((a, b) => (b.minor > a.minor ? b : a))
    return {
      // Receipts record money spent: prefill a negative expense amount.
      value: -best.minor,
      confidence: 0.9,
      level: levelOf(0.9, true),
      spans: [best.line.trim()],
      note: "Largest amount on a total line.",
    }
  }
  if (fallbackHits.length > 0) {
    const best = fallbackHits.reduce((a, b) => (b.minor > a.minor ? b : a))
    return {
      value: -best.minor,
      confidence: 0.5,
      level: levelOf(0.5, true),
      spans: [best.line.trim()],
      note: "Largest amount found; no total keyword nearby, please verify.",
    }
  }
  return missing("No amount found on the receipt.")
}

// ---------------------------------------------------------------------------
// Merchant: first content-bearing line.
// ---------------------------------------------------------------------------

const MERCHANT_SKIP = /^(receipt|invoice|sales?\s+receipt|order|guest\s+check|ticket)\b/i

/**
 * Remove date/time fragments before money parsing. Kept deliberately
 * narrow (numeric + written-month dates, clock times) so amounts survive.
 */
function stripDatesAndTimes(line: string): string {
  return line
    .replaceAll(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replaceAll(/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/g, " ")
    .replaceAll(
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi,
      " ",
    )
    .replaceAll(
      /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\b/gi,
      " ",
    )
    .replaceAll(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b/gi, " ")
}
const MONTH_WORD = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?/i

function looksLikeDateOrAmountOnly(line: string): boolean {
  const trimmed = line.trim()
  if (/^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(trimmed)) return true
  if (MONTH_WORD.test(trimmed) && /\d/.test(trimmed)) return true
  const withoutMoney = trimmed.replace(/[$€£¥₹\d\s.,:()-]/g, "")
  return withoutMoney.length < 2
}

function parseMerchant(lines: readonly string[]): OcrFieldCandidate<string> {
  const windowed = lines.slice(0, 5)
  for (let index = 0; index < windowed.length; index += 1) {
    const line = (windowed[index] ?? "").trim()
    if (line.length < 2) continue
    if (MERCHANT_SKIP.test(line)) continue
    if (TOTAL_KEYWORDS.test(line)) continue
    if (looksLikeDateOrAmountOnly(line)) continue
    if (!/[A-Za-z]{2,}/.test(line)) continue
    const confidence = index === 0 ? 0.85 : 0.6
    return {
      value: line,
      confidence,
      level: levelOf(confidence, true),
      spans: [line],
      note:
        index === 0
          ? "First content line of the receipt."
          : `First content line after skipping ${index} header line(s).`,
    }
  }
  return missing("No store-name line found.")
}

// ---------------------------------------------------------------------------
// Dates: ISO, numeric (US-first with ambiguity flag), written month.
// ---------------------------------------------------------------------------

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const fullYear = year < 100 ? (year >= 70 ? 1900 + year : 2000 + year) : year
  if (fullYear < 1990 || fullYear > 2100) return null
  const probe = new Date(Date.UTC(fullYear, month - 1, day))
  if (
    probe.getUTCFullYear() !== fullYear ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  return `${fullYear}-${pad2(month)}-${pad2(day)}`
}

interface DateHit {
  iso: string
  confidence: number
  span: string
  note: string
}

function scanLineForDate(line: string): DateHit | null {
  const trimmed = line.trim()
  const isoMatch = /(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/.exec(trimmed)
  if (isoMatch) {
    const iso = toIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
    if (iso) {
      return { iso, confidence: 0.9, span: trimmed, note: "ISO date on the receipt." }
    }
  }
  const written =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(
      trimmed,
    ) ??
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i.exec(
      trimmed,
    )
  if (written) {
    const first = written[1] ?? ""
    const second = written[2] ?? ""
    const third = written[3] ?? ""
    const monthWord = /[a-z]/i.test(first) ? first : second
    const dayText = /[a-z]/i.test(first) ? second : first
    const month =
      MONTH_INDEX[monthWord.slice(0, 4).toLowerCase()] ??
      MONTH_INDEX[monthWord.slice(0, 3).toLowerCase()]
    if (month !== undefined) {
      const iso = toIso(Number(third), month, Number(dayText))
      if (iso) {
        return { iso, confidence: 0.85, span: trimmed, note: "Written month date on the receipt." }
      }
    }
  }
  const numeric = /(?<!\d)(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?!\d)/.exec(trimmed)
  if (numeric) {
    const first = Number(numeric[1])
    const second = Number(numeric[2])
    const year = Number(numeric[3])
    if (first > 12 && second <= 12) {
      // Day-first ("25/12/2026").
      const iso = toIso(year, second, first)
      if (iso) {
        return { iso, confidence: 0.8, span: trimmed, note: "Day-first numeric date." }
      }
    } else if (second > 12 && first <= 12) {
      // Month-first, unambiguous ("12/25/2026").
      const iso = toIso(year, first, second)
      if (iso) {
        return { iso, confidence: 0.8, span: trimmed, note: "Month-first numeric date." }
      }
    } else if (first <= 12 && second <= 12 && first > 0 && second > 0) {
      // Ambiguous ("01/02/2026"): assume US month-first, flag for review.
      const iso = toIso(year, first, second)
      if (iso) {
        return {
          iso,
          confidence: 0.55,
          span: trimmed,
          note: "Ambiguous numeric date, read month-first; please verify.",
        }
      }
    }
  }
  return null
}

function parseDate(lines: readonly string[]): OcrFieldCandidate<string> {
  for (const line of lines) {
    if (!line || !/\d/.test(line)) continue
    const hit = scanLineForDate(line)
    if (hit) {
      return {
        value: hit.iso,
        confidence: hit.confidence,
        level: levelOf(hit.confidence, true),
        spans: [hit.span],
        note: hit.note,
      }
    }
  }
  return missing("No date found on the receipt.")
}

// ---------------------------------------------------------------------------

/** Turn raw OCR line strings into merchant/total/date draft candidates. */
export function parseReceiptOcr(rawLines: readonly string[]): ReceiptOcrCandidates {
  const lines = rawLines.map((line) => line.trim()).filter((line) => line.length > 0)
  const merchant = lines.length > 0 ? parseMerchant(lines) : missing("No text recognized.")
  const amountMinor = lines.length > 0 ? parseTotal(lines) : missing("No text recognized.")
  const date = lines.length > 0 ? parseDate(lines) : missing("No text recognized.")
  const lowConfidence =
    merchant.value === null ||
    amountMinor.value === null ||
    date.value === null ||
    merchant.confidence < OCR_REVIEW_THRESHOLD ||
    amountMinor.confidence < OCR_REVIEW_THRESHOLD ||
    date.confidence < OCR_REVIEW_THRESHOLD
  return { merchant, amountMinor, date, lowConfidence, lineCount: lines.length }
}

/**
 * dataAnalyzer.ts
 * Fully dynamic column intelligence — works for ANY CSV.
 * Detects types, patterns, best groupby cols, primary metrics.
 * No assumptions about Amazon data structure.
 */

import type { ColumnProfile, ColumnType } from '@/types'

const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}/,
  /^\d{2}\/\d{2}\/\d{4}/,
  /^\d{2}-\d{2}-\d{4}/,
  /^\d{4}\/\d{2}\/\d{2}/,
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
]

const ID_PATTERNS = [/_id$|^id$|_key$|^key$|_code$|^code$|_uuid$|^uuid$/i]
const REGION_PATTERNS = [/region|country|state|city|location|territory|area|zone|market|geo/i]
const PAYMENT_PATTERNS = [/payment|method|pay_type|transaction_type|mode|channel/i]
const RATING_PATTERNS = [/rating|score|stars|review|satisfaction|nps|grade/i]
const DISCOUNT_PATTERNS = [/discount|coupon|promo|reduction|off|deal/i]
const REVENUE_PATTERNS = [/revenue|sales|amount|total|price|value|cost|profit|gmv|income/i]
const QTY_PATTERNS = [/qty|quantity|units|count|volume|sold|orders/i]

// ─── Detect single column type ────────────────────────────────────────────────
export function detectColumnType(
  name: string,
  values: (string | number | null | undefined)[]
): ColumnType {
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '')
  if (!nonNull.length) return 'text'

  // ID check by name first
  if (ID_PATTERNS.some(p => p.test(name))) return 'id'

  // Check if all are numeric
  const numericCount = nonNull.filter(v => !isNaN(Number(v))).length
  if (numericCount / nonNull.length > 0.85) {
    // Could still be an ID (sequential integers with high uniqueness)
    const nums = nonNull.map(v => Number(v))
    const unique = new Set(nums).size
    if (unique === nonNull.length && Number.isInteger(nums[0]) && nums[0] < 1000000) {
      // Sequential-ish integers = likely ID
      const sorted = [...nums].sort((a, b) => a - b)
      const isSequential = sorted[sorted.length - 1] - sorted[0] === sorted.length - 1
      if (isSequential || unique > nonNull.length * 0.95) return 'id'
    }
    return 'numeric'
  }

  // Date check
  const dateCount = nonNull.filter(v =>
    typeof v === 'string' && DATE_PATTERNS.some(p => p.test(v.trim()))
  ).length
  if (dateCount / nonNull.length > 0.7) return 'date'

  // Boolean
  const boolValues = new Set(['true','false','yes','no','1','0','y','n'])
  const boolCount = nonNull.filter(v => boolValues.has(String(v).toLowerCase())).length
  if (boolCount / nonNull.length > 0.85) return 'boolean'

  // Categorical vs text: low cardinality = categorical
  const uniqueCount = new Set(nonNull.map(v => String(v).toLowerCase())).size
  if (uniqueCount <= Math.max(20, nonNull.length * 0.1)) return 'categorical'

  return 'text'
}

// ─── Profile a single column ──────────────────────────────────────────────────
export function profileColumn(
  name: string,
  rows: Record<string, unknown>[]
): ColumnProfile {
  const values = rows.map(r => r[name] as string | number | null)
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '') as (string | number)[]
  const type = detectColumnType(name, values)
  const uniqueCount = new Set(nonNull.map(v => String(v))).size
  const nullCount = values.length - nonNull.length

  const profile: ColumnProfile = {
    name,
    type,
    uniqueCount,
    nullCount,
    sampleValues: nonNull.slice(0, 5),
    isHighCardinality: uniqueCount > 50,
  }

  if (type === 'numeric') {
    const nums = nonNull.map(v => Number(v)).filter(n => !isNaN(n))
    profile.min = Math.min(...nums)
    profile.max = Math.max(...nums)
    profile.mean = nums.reduce((a, b) => a + b, 0) / nums.length
  }

  if (type === 'categorical') {
    // Top values with count and sum (if paired with a numeric col later)
    const counts: Record<string, number> = {}
    nonNull.forEach(v => { const k = String(v); counts[k] = (counts[k] || 0) + 1 })
    profile.topValues = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([value, count]) => ({ value, count, sum: 0 }))
  }

  return profile
}

// ─── Score which column is the "primary metric" ───────────────────────────────
export function scorePrimaryMetric(profiles: ColumnProfile[]): string {
  const numerics = profiles.filter(p => p.type === 'numeric' && !p.isHighCardinality)
  if (!numerics.length) return ''

  // Score: revenue-like name > large values > last column
  const scored = numerics.map(p => {
    let score = 0
    if (REVENUE_PATTERNS.test(p.name)) score += 100
    if (QTY_PATTERNS.test(p.name)) score += 50
    if ((p.mean ?? 0) > 100) score += 30
    if ((p.max ?? 0) > 1000) score += 20
    // Prefer non-percentage, non-rating columns
    if (RATING_PATTERNS.test(p.name)) score -= 40
    if (DISCOUNT_PATTERNS.test(p.name)) score -= 20
    if ((p.max ?? 0) <= 100 && (p.min ?? 0) >= 0) score -= 10 // looks like percentage
    return { name: p.name, score }
  })

  return scored.sort((a, b) => b.score - a.score)[0]?.name ?? numerics[numerics.length - 1].name
}

// ─── Score primary dimension (best groupby column) ───────────────────────────
export function scorePrimaryDimension(profiles: ColumnProfile[]): string {
  const cats = profiles.filter(p => p.type === 'categorical')
  if (!cats.length) return ''

  const scored = cats.map(p => {
    let score = 0
    // Not too many, not too few unique values
    if (p.uniqueCount >= 2 && p.uniqueCount <= 15) score += 80
    else if (p.uniqueCount <= 30) score += 40
    // Category-like names score high
    if (/categor|type|class|group|segment|product|item|brand/i.test(p.name)) score += 60
    if (REGION_PATTERNS.test(p.name)) score += 40
    if (PAYMENT_PATTERNS.test(p.name)) score += 30
    // ID cols score low
    if (ID_PATTERNS.some(p2 => p2.test(p.name))) score -= 100
    return { name: p.name, score }
  })

  return scored.sort((a, b) => b.score - a.score)[0]?.name ?? cats[0].name
}

// ─── Detect semantic column roles ─────────────────────────────────────────────
export interface SemanticRoles {
  regionCol: string | null
  paymentCol: string | null
  ratingCol: string | null
  discountCol: string | null
  quantityCol: string | null
  revenueCol: string | null
}

export function detectSemanticRoles(profiles: ColumnProfile[]): SemanticRoles {
  const find = (pattern: RegExp, type?: ColumnType) =>
    profiles.find(p => pattern.test(p.name) && (!type || p.type === type))?.name ?? null

  return {
    regionCol:   find(REGION_PATTERNS, 'categorical'),
    paymentCol:  find(PAYMENT_PATTERNS, 'categorical'),
    ratingCol:   find(RATING_PATTERNS, 'numeric'),
    discountCol: find(DISCOUNT_PATTERNS, 'numeric'),
    quantityCol: find(QTY_PATTERNS, 'numeric'),
    revenueCol:  find(REVENUE_PATTERNS, 'numeric'),
  }
}

// ─── Export pattern constants for use in engine ───────────────────────────────
export { REGION_PATTERNS, PAYMENT_PATTERNS, RATING_PATTERNS, DISCOUNT_PATTERNS, REVENUE_PATTERNS, QTY_PATTERNS }

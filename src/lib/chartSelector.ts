/**
 * chartSelector.ts
 * Determines best chart type and provides recommendation text.
 * Reads user query AND data characteristics.
 */

import type { ChartType } from '@/types'
import type { DatasetProfile } from '@/types'

export interface ChartRecommendation {
  type: ChartType
  reason: string
}

// ─── Explicit user requests override everything ───────────────────────────────
const EXPLICIT_CHART_PATTERNS: Array<{ pattern: RegExp; type: ChartType; label: string }> = [
  { pattern: /horizontal.?bar|hbar|h\.?bar|ranking|ranked/i, type: 'horizontalBar', label: 'horizontal bar' },
  { pattern: /\bbar\b(?!.*pie|.*dough|.*line)/i, type: 'bar', label: 'bar chart' },
  { pattern: /\bline\b|trend.?line/i, type: 'line', label: 'line chart' },
  { pattern: /pie|donut|doughnut|circle|proportion/i, type: 'doughnut', label: 'pie/doughnut' },
  { pattern: /radar|spider|web.?chart/i, type: 'radar', label: 'radar chart' },
  { pattern: /scatter|correlation|plot/i, type: 'scatter', label: 'scatter plot' },
]

// ─── Select chart type based on query + data ──────────────────────────────────
export function selectChartType(
  query: string,
  profile: DatasetProfile,
  context: 'primary' | 'secondary' = 'primary'
): ChartRecommendation {
  const q = query.toLowerCase()

  // 1. Explicit user request — always honor
  for (const { pattern, type, label } of EXPLICIT_CHART_PATTERNS) {
    if (pattern.test(query)) {
      return { type, reason: `You requested a ${label} — chosen exactly as asked.` }
    }
  }

  // 2. Time-series queries → line
  const isTimeSeries = /trend|over.?time|month|year|quarter|daily|weekly|timeline|2022|2023|period|historical/i.test(q)
  if (isTimeSeries && profile.hasTimeSeries) {
    return { type: 'line', reason: 'Line chart — best for showing trends over time, peaks, and seasonality.' }
  }

  // 3. Ranking / top-N → horizontal bar
  const isRanking = /top|best|highest|lowest|worst|rank|compare|versus|vs\b/i.test(q)
  if (isRanking) {
    return { type: 'horizontalBar', reason: 'Horizontal bar — perfect for rankings, labels stay readable and values are easy to compare.' }
  }

  // 4. Proportion / share → doughnut
  const isProportion = /share|proportion|breakdown|distribution|percentage|percent|split|composition/i.test(q)
  if (isProportion) {
    return { type: 'doughnut', reason: 'Doughnut chart — shows each segment\'s share of the total at a glance.' }
  }

  // 5. Multi-attribute comparison → radar
  const isMultiAttr = /rating|score|performance|efficiency|quality|multi/i.test(q)
  if (isMultiAttr && profile.categoricalCols.length >= 3) {
    return { type: 'radar', reason: 'Radar chart — great for comparing multiple attributes across categories simultaneously.' }
  }

  // 6. Secondary charts: alternate types to avoid duplication
  if (context === 'secondary') {
    if (profile.hasTimeSeries) {
      return { type: 'bar', reason: 'Bar chart — complements the trend chart with discrete period comparisons.' }
    }
    return { type: 'bar', reason: 'Bar chart — clear discrete comparisons for secondary analysis.' }
  }

  // 7. Default: if few categories (≤8) → doughnut, else horizontal bar
  const dimCount = Object.keys(profile.aggregations.byPrimaryDimension).length
  if (dimCount <= 8 && dimCount >= 2) {
    return { type: 'doughnut', reason: 'Doughnut chart — proportional view is clearest for this number of categories.' }
  }

  return { type: 'horizontalBar', reason: 'Horizontal bar — best for comparing many categories with readable labels.' }
}

// ─── Format period label ──────────────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export function formatPeriodLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const mIdx = parseInt(m) - 1
  return `${MONTHS_SHORT[mIdx] ?? m} '${y?.slice(2) ?? ''}`
}

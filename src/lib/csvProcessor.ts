/**
 * csvProcessor.ts
 * Converts any CSV into a rich DatasetProfile.
 * Fully dynamic — no assumptions about column names.
 */

import type { DatasetProfile, DatasetAggregations } from '@/types'
import {
  profileColumn,
  scorePrimaryMetric,
  scorePrimaryDimension,
  detectSemanticRoles,
  REGION_PATTERNS,
  PAYMENT_PATTERNS,
  RATING_PATTERNS,
  DISCOUNT_PATTERNS,
} from './dataAnalyzer'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Main processor ───────────────────────────────────────────────────────────
export function processDataset(
  rows: Record<string, unknown>[],
  fileName: string
): DatasetProfile {
  if (!rows.length) throw new Error('Dataset is empty')

  const colNames = Object.keys(rows[0])
  const profiles = colNames.map(name => profileColumn(name, rows))

  const numericCols = profiles.filter(p => p.type === 'numeric').map(p => p.name)
  const categoricalCols = profiles.filter(p => p.type === 'categorical').map(p => p.name)
  const dateCols = profiles.filter(p => p.type === 'date').map(p => p.name)
  const idCols = profiles.filter(p => p.type === 'id').map(p => p.name)

  const primaryMetric = scorePrimaryMetric(profiles)
  const primaryDimension = scorePrimaryDimension(profiles)
  const dateColumn = dateCols[0] ?? null
  const roles = detectSemanticRoles(profiles)

  // Build aggregations
  const agg = buildAggregations(rows, {
    primaryMetric,
    primaryDimension,
    secondaryDimension: categoricalCols.find(c => c !== primaryDimension) ?? '',
    dateColumn,
    roles,
  })

  // Build smart suggestions based on ACTUAL column names and data patterns
  const suggestions = buildSmartSuggestions({
    name: fileName,
    primaryMetric,
    primaryDimension,
    categoricalCols,
    dateCols,
    numericCols,
    roles,
    agg,
  })

  const name = fileName.replace(/\.csv$/i, '').replace(/[_-]/g, ' ')

  return {
    name,
    rowCount: rows.length,
    columns: profiles,
    numericCols,
    categoricalCols,
    dateCols,
    idCols,
    primaryMetric,
    primaryDimension,
    dateColumn,
    hasTimeSeries: dateCols.length > 0,
    hasCategories: categoricalCols.length > 0,
    hasRegions: !!roles.regionCol,
    hasPayments: !!roles.paymentCol,
    smartSuggestions: suggestions,
    aggregations: agg,
  }
}

// ─── Build all aggregations ───────────────────────────────────────────────────
interface AggParams {
  primaryMetric: string
  primaryDimension: string
  secondaryDimension: string
  dateColumn: string | null
  roles: ReturnType<typeof detectSemanticRoles>
}

function buildAggregations(
  rows: Record<string, unknown>[],
  { primaryMetric, primaryDimension, secondaryDimension, dateColumn, roles }: AggParams
): DatasetAggregations {
  const getNum = (row: Record<string, unknown>, col: string) => parseFloat(String(row[col] ?? 0)) || 0
  const getStr = (row: Record<string, unknown>, col: string) => String(row[col] ?? 'Unknown').trim()

  // 1. By primary dimension
  const byPrimaryDimension: Record<string, number> = {}
  const countByDimension: Record<string, number> = {}
  if (primaryDimension) {
    rows.forEach(r => {
      const k = getStr(r, primaryDimension)
      byPrimaryDimension[k] = (byPrimaryDimension[k] ?? 0) + getNum(r, primaryMetric)
      countByDimension[k] = (countByDimension[k] ?? 0) + 1
    })
  }

  // 2. By secondary dimension
  const bySecondaryDimension: Record<string, number> = {}
  if (secondaryDimension) {
    rows.forEach(r => {
      const k = getStr(r, secondaryDimension)
      bySecondaryDimension[k] = (bySecondaryDimension[k] ?? 0) + getNum(r, primaryMetric)
    })
  }

  // 3. By date (monthly)
  const byDate: Record<string, number> = {}
  const dateCount: Record<string, number> = {}
  if (dateColumn) {
    rows.forEach(r => {
      const raw = String(r[dateColumn] ?? '')
      const ym = extractYearMonth(raw)
      if (ym) {
        byDate[ym] = (byDate[ym] ?? 0) + getNum(r, primaryMetric)
        dateCount[ym] = (dateCount[ym] ?? 0) + 1
      }
    })
  }

  // 4. By date × primary dimension (for stacked charts)
  const byDateAndDimension: Record<string, Record<string, number>> = {}
  if (dateColumn && primaryDimension) {
    rows.forEach(r => {
      const ym = extractYearMonth(String(r[dateColumn] ?? ''))
      const dim = getStr(r, primaryDimension)
      if (ym) {
        if (!byDateAndDimension[ym]) byDateAndDimension[ym] = {}
        byDateAndDimension[ym][dim] = (byDateAndDimension[ym][dim] ?? 0) + getNum(r, primaryMetric)
      }
    })
  }

  // 5. Cross-tab: primary dimension × secondary dimension
  const crossTab: Record<string, Record<string, number>> = {}
  if (primaryDimension && secondaryDimension) {
    rows.forEach(r => {
      const dim1 = getStr(r, primaryDimension)
      const dim2 = getStr(r, secondaryDimension)
      if (!crossTab[dim1]) crossTab[dim1] = {}
      crossTab[dim1][dim2] = (crossTab[dim1][dim2] ?? 0) + getNum(r, primaryMetric)
    })
  }

  const totalMetric = Object.values(byPrimaryDimension).reduce((a, b) => a + b, 0)
    || rows.reduce((s, r) => s + getNum(r, primaryMetric), 0)
  const avgMetric = rows.length ? totalMetric / rows.length : 0

  // Top dimensions with share
  const topDimensions = Object.entries(byPrimaryDimension)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value, share: totalMetric ? value / totalMetric : 0 }))

  // Time series sorted
  const timeSeries = Object.entries(byDate)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, value]) => ({ period, value, count: dateCount[period] ?? 0 }))

  return {
    byPrimaryDimension,
    bySecondaryDimension,
    byDate: Object.fromEntries(Object.entries(byDate).sort()),
    byDateAndDimension,
    countByDimension,
    totalMetric,
    avgMetric,
    topDimensions,
    timeSeries,
    crossTab,
  }
}

// ─── Extract YYYY-MM from various date formats ────────────────────────────────
function extractYearMonth(raw: string): string | null {
  if (!raw) return null
  // YYYY-MM-DD or YYYY/MM/DD
  const iso = raw.match(/(\d{4})[-/](\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}`
  // DD/MM/YYYY or MM/DD/YYYY
  const dmy = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}`
  return null
}

// ─── Build smart suggestions from ACTUAL column patterns ─────────────────────
interface SuggestionParams {
  name: string
  primaryMetric: string
  primaryDimension: string
  categoricalCols: string[]
  dateCols: string[]
  numericCols: string[]
  roles: ReturnType<typeof detectSemanticRoles>
  agg: DatasetAggregations
}

export function buildSmartSuggestions(p: SuggestionParams): string[] {
  const suggestions: string[] = []
  const m = p.primaryMetric || 'value'
  const d = p.primaryDimension || p.categoricalCols[0] || 'category'
  const topDim = p.agg.topDimensions[0]?.name

  // Time-series suggestions
  if (p.dateCols.length) {
    suggestions.push(`Show monthly ${m} trends over time`)
    if (p.agg.timeSeries.length > 0) {
      const peak = p.agg.timeSeries.reduce((a, b) => a.value > b.value ? a : b)
      suggestions.push(`Which month had the highest ${m}? (hint: ${formatPeriod(peak.period)})`)
    }
    suggestions.push(`Compare ${m} year over year`)
  }

  // Category suggestions
  if (p.categoricalCols.length) {
    suggestions.push(`Breakdown ${m} by ${d} as a bar chart`)
    if (topDim) suggestions.push(`Why is ${topDim} the top performer?`)
    suggestions.push(`Rank all ${d}s by ${m} as a horizontal bar`)
    suggestions.push(`Show ${m} distribution as a pie chart`)
  }

  // Region-specific
  if (p.roles.regionCol) {
    suggestions.push(`${m} breakdown by ${p.roles.regionCol}`)
    suggestions.push(`Which ${p.roles.regionCol} has the highest ${m}?`)
  }

  // Payment-specific
  if (p.roles.paymentCol) {
    suggestions.push(`Best performing ${p.roles.paymentCol} by ${m}`)
  }

  // Rating
  if (p.roles.ratingCol) {
    suggestions.push(`Relationship between ${p.roles.ratingCol} and ${m}`)
    suggestions.push(`Which ${d} has the highest ${p.roles.ratingCol}?`)
  }

  // Discount
  if (p.roles.discountCol) {
    suggestions.push(`Does ${p.roles.discountCol} increase ${m}?`)
  }

  // Quantity
  if (p.roles.quantityCol && p.roles.quantityCol !== m) {
    suggestions.push(`Compare ${m} vs ${p.roles.quantityCol} per ${d}`)
  }

  // Multiple numeric cols
  if (p.numericCols.length > 2) {
    suggestions.push(`Summarize the key metrics of this dataset`)
  }

  // Deduplicate and return top 6
  return [...new Set(suggestions)].slice(0, 6)
}

function formatPeriod(ym: string): string {
  const [y, m] = ym.split('-')
  return `${MONTHS[parseInt(m) - 1]} ${y}`
}

// ─── Amazon default dataset (pre-built profile) ───────────────────────────────
export const AMAZON_PROFILE: DatasetProfile = {
  name: 'Amazon Sales',
  rowCount: 50000,
  columns: [],
  numericCols: ['price','discount_percent','quantity_sold','rating','review_count','discounted_price','total_revenue'],
  categoricalCols: ['product_category','customer_region','payment_method'],
  dateCols: ['order_date'],
  idCols: ['order_id','product_id'],
  primaryMetric: 'total_revenue',
  primaryDimension: 'product_category',
  dateColumn: 'order_date',
  hasTimeSeries: true,
  hasCategories: true,
  hasRegions: true,
  hasPayments: true,
  smartSuggestions: [
    'Revenue breakdown by product category',
    'Monthly revenue trends 2022 vs 2023',
    'Sales breakdown by region',
    'Best performing payment method',
    'Top 3 categories by revenue',
    'Which region has the highest revenue?',
  ],
  aggregations: {
    byPrimaryDimension: {"Books":5484863.03,"Fashion":5480123.34,"Sports":5407235.82,"Beauty":5550624.97,"Electronics":5470594.03,"Home & Kitchen":5473132.55},
    bySecondaryDimension: {"North America":8277217.84,"Asia":8175199.83,"Europe":8112311.57,"Middle East":8301844.5},
    byPaymentDimension: {"Wallet":6678638.47,"UPI":6579441.44,"Cash on Delivery":6546386.94,"Credit Card":6540087.16,"Debit Card":6522019.73},
    payCount: {"Wallet":10106,"UPI":10078,"Cash on Delivery":9927,"Credit Card":9908,"Debit Card":9981},
    byDate: {"2022-01":1419751.89,"2022-02":1266714.29,"2022-03":1392585.42,"2022-04":1371955.83,"2022-05":1374779.57,"2022-06":1352125.49,"2022-07":1346089.18,"2022-08":1449308.06,"2022-09":1403967.06,"2022-10":1334818.11,"2022-11":1291100.05,"2022-12":1386209.61,"2023-01":1464174.99,"2023-02":1238380.51,"2023-03":1366418.41,"2023-04":1307017.94,"2023-05":1431398.77,"2023-06":1394822.13,"2023-07":1442176.66,"2023-08":1396321.88,"2023-09":1341007.86,"2023-10":1425936.23,"2023-11":1334328.47,"2023-12":1335185.33},
    byDateAndDimension: {},
    countByDimension: {"Books":8334,"Fashion":8330,"Sports":8244,"Beauty":8382,"Electronics":8271,"Home & Kitchen":8279},
    totalMetric: 32866573.74,
    avgMetric: 657.33,
    topDimensions: [
      {name:'Beauty',value:5550624.97,share:0.169},
      {name:'Books',value:5484863.03,share:0.167},
      {name:'Fashion',value:5480123.34,share:0.167},
      {name:'Home & Kitchen',value:5473132.55,share:0.167},
      {name:'Electronics',value:5470594.03,share:0.166},
      {name:'Sports',value:5407235.82,share:0.164},
    ],
    timeSeries: Object.entries({"2022-01":1419751.89,"2022-02":1266714.29,"2022-03":1392585.42,"2022-04":1371955.83,"2022-05":1374779.57,"2022-06":1352125.49,"2022-07":1346089.18,"2022-08":1449308.06,"2022-09":1403967.06,"2022-10":1334818.11,"2022-11":1291100.05,"2022-12":1386209.61,"2023-01":1464174.99,"2023-02":1238380.51,"2023-03":1366418.41,"2023-04":1307017.94,"2023-05":1431398.77,"2023-06":1394822.13,"2023-07":1442176.66,"2023-08":1396321.88,"2023-09":1341007.86,"2023-10":1425936.23,"2023-11":1334328.47,"2023-12":1335185.33}).map(([period,value])=>({period,value,count:2000})),
    crossTab: {"North America":{"Books":1333669.82,"Beauty":1402769.67,"Home & Kitchen":1401485.02,"Electronics":1364757.86,"Fashion":1389302.51,"Sports":1385232.96},"Asia":{"Fashion":1334485.23,"Sports":1358085.08,"Books":1391961.69,"Home & Kitchen":1369676.45,"Electronics":1319074.46,"Beauty":1401916.92},"Europe":{"Sports":1323763.2,"Electronics":1407118.94,"Home & Kitchen":1326424.56,"Beauty":1358226.42,"Fashion":1366107.0,"Books":1330671.45},"Middle East":{"Books":1428560.07,"Beauty":1387711.96,"Fashion":1390228.6,"Sports":1340154.58,"Electronics":1379642.77,"Home & Kitchen":1375546.52}},
  }
}

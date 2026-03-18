/**
 * promptBuilder.ts
 * Builds the AI prompt dynamically from dataset profile.
 * Works for ANY dataset — no hardcoded Amazon assumptions.
 */

import type { DatasetProfile, AIEngine } from '@/types'

// Convert snake_case/camelCase column names to human readable
function humanize(col: string): string {
  return col
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim()
}


// ─── Build full prompt ────────────────────────────────────────────────────────
export function buildPrompt(query: string, profile: DatasetProfile): string {
  const ctx = buildContext(profile)
  const schema = buildResponseSchema()
  const rules = buildRules(profile)

  return `You are FLOW, an elite Business Intelligence AI. Analyze the question and return ONLY valid JSON — no markdown, no text outside JSON.

${ctx}

USER QUESTION: "${query}"

${schema}

${rules}`
}

// ─── Dataset context ──────────────────────────────────────────────────────────
function buildContext(p: DatasetProfile): string {
  const agg = p.aggregations
  const topDims = agg.topDimensions.slice(0, 6)
    .map(d => `${d.name}: ${formatVal(d.value)} (${(d.share * 100).toFixed(1)}%)`)
    .join(', ')

  const dateRange = agg.timeSeries.length
    ? `${agg.timeSeries[0].period} to ${agg.timeSeries[agg.timeSeries.length - 1].period}`
    : 'N/A'

  const secDims = Object.entries(agg.bySecondaryDimension)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${formatVal(v)}`)
    .join(', ')

  const lines = [
    `=== DATASET: ${p.name} ===`,
    `Rows: ${p.rowCount.toLocaleString()} | Date range: ${dateRange}`,
    `Columns: ${p.columns.map(c => `${c.name} (${c.type})`).join(', ')}`,
    `Primary metric: "${humanize(p.primaryMetric)}" (column: ${p.primaryMetric}) | Primary dimension: "${humanize(p.primaryDimension)}" (column: ${p.primaryDimension})`,,
    ``,
    `TOP ${p.primaryDimension || 'CATEGORIES'} BY ${p.primaryMetric || 'VALUE'}:`,
    topDims || 'N/A',
    ``,
    p.categoricalCols[1] ? `${p.categoricalCols[1].toUpperCase()}: ${secDims || 'N/A'}` : '',
    p.hasTimeSeries ? `TIME SERIES: ${agg.timeSeries.length} periods of data available` : '',
    ``,
    `TOTALS: Revenue/Metric total = ${formatVal(agg.totalMetric)} | Avg per row = ${formatVal(agg.avgMetric)}`,
  ].filter(Boolean)

  return `DATA CONTEXT:\n${lines.join('\n')}`
}

// ─── Response schema ──────────────────────────────────────────────────────────
function buildResponseSchema(): string {
  return `RETURN THIS EXACT JSON:
{
  "intent": "revenue|category|region|payment|trend|comparison|rating|discount|top_n|custom|out_of_scope",
  "insight": "2-3 sentence executive summary with specific numbers from the data. Use **bold** for key findings.",
  "anomalies": [{"type": "warn|info|danger", "text": "short finding, max 10 words"}],
  "kpis": [{"label": "Metric Name", "value": "$1.2M", "sub": "context", "trend": "up|dn|none", "color": "c1|c2|c3|c4"}],
  "chartRecommendation": "One sentence: why this chart type is best for this question.",
  "charts": [
    {
      "type": "line|bar|horizontalBar|doughnut|radar",
      "title": "Descriptive chart title",
      "subtitle": "What this shows",
      "span": 1,
      "labels": ["label1", "label2"],
      "datasets": [{"label": "Series", "data": [100, 200], "color": 0}]
    }
  ],
  "table": {"show": true, "headers": ["Col1", "Col2"], "rows": [["val1", "val2"]]},
  "followups": ["Dataset-specific follow-up 1?", "Follow-up 2?", "Follow-up 3?"]
}`
}

// ─── Rules ────────────────────────────────────────────────────────────────────
function buildRules(p: DatasetProfile): string {
  return `STRICT RULES:
1. Use ONLY data from the dataset context above — never invent numbers
2. 2–4 KPIs always relevant to the question
3. 1–3 charts chosen intelligently:
   - Time series data → "line" 
   - Rankings/comparisons → "horizontalBar" (labels stay readable)
   - Proportions/share → "doughnut"
   - Multi-attribute → "radar"
   - If user explicitly says a chart type (e.g. "horizontal bar"), USE THAT EXACT TYPE
4. Follow-ups must reference ACTUAL column names: ${p.categoricalCols.slice(0,3).join(', ') || 'the dataset columns'}
5. If question is outside dataset scope, set intent to "out_of_scope"
6. All data values in charts must come from the dataset context provided`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatVal(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return v.toFixed(2)
}

// Note: secondaryDimension is computed from categoricalCols[1] in csvProcessor

/**
 * engine.ts — AI orchestrator + fully dynamic local fallback
 * Fixes: local fallback label, column names in insights, followup underscore issue
 */
import type { DashboardResult, DatasetProfile, AIEngine, ChartConfig, KPI, Anomaly } from '@/types'
import { buildPrompt } from './promptBuilder'
import { selectChartType, formatPeriodLabel } from './chartSelector'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Humanize column names ─────────────────────────────────────────────────────
function H(col: string): string {
  return col.replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,l=>l.toUpperCase()).trim()
}

// ── Sanitize AI insight text — remove raw column names ────────────────────────
function sanitizeInsight(text: string, profile: DatasetProfile): string {
  let t = text
  // Replace all column names with humanized versions
  profile.columns.forEach(col => {
    const name = col.name
    const human = H(name)
    // Replace exact matches with word boundaries
    t = t.replace(new RegExp(`\\b${name}\\b`, 'g'), human)
  })
  return t
}

// ── Sanitize followup strings — remove underscores ───────────────────────────
function sanitizeFollowups(followups: string[], profile: DatasetProfile): string[] {
  return followups.map(f => {
    let t = f
    profile.columns.forEach(col => {
      t = t.replace(new RegExp(`\\b${col.name}\\b`, 'g'), H(col.name))
    })
    return t
  })
}

// ── Greeting/nonsense detector ────────────────────────────────────────────────
const GREETING_PATTERNS = /^(hi|hello|hey|howdy|sup|yo|what'?s up|how are you|good morning|good evening|good afternoon|thanks|thank you|bye|goodbye|ok|okay|yes|no|sure|lol|haha|test|testing|ping|who are you|what are you)\b/i
const MIN_QUERY_LENGTH = 3

// ── Top-N extractor ───────────────────────────────────────────────────────────
function extractTopN(query: string): number | null {
  const m = query.match(/top\s+(\d+)|(\d+)\s+top|first\s+(\d+)|best\s+(\d+)/i)
  if (m) return parseInt(m[1]||m[2]||m[3]||m[4])
  if (/top\s+(three|3)/i.test(query)) return 3
  if (/top\s+(five|5)/i.test(query)) return 5
  if (/top\s+(ten|10)/i.test(query)) return 10
  return null
}

// ── Normalize synonyms to dataset terms ──────────────────────────────────────
function normalizeQuery(query: string, profile: DatasetProfile): string {
  let q = query
  const dim = H(profile.primaryDimension)
  const metric = H(profile.primaryMetric)
  q = q.replace(/\b(brands?|products?|items?|types?|segments?|groups?|classes?|kinds?)\b/gi, dim)
  q = q.replace(/\b(sales?|earnings?|income|profit|money|turnover)\b/gi, metric)
  return q
}

// Detect queries that should always use local engine (avoids Gemini misclassifying)
function isAlwaysLocal(query: string, profile: DatasetProfile): boolean {
  const q = query.toLowerCase()
  // Payment queries with dataset context
  if (profile.hasPayments && /pay|method|upi|wallet|card|cash/i.test(q)) return true
  // Region queries
  if (profile.hasRegions && /region|country|geography|location/i.test(q)) return true
  // Clear trend queries
  if (profile.hasTimeSeries && /monthly|yearly|trend|2022|2023|over time/i.test(q)) return true
  return false
}

export function fmtVal(v: number): string {
  if (v >= 1e9) return `$${(v/1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v/1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`
  if (v !== 0 && Math.abs(v) < 100 && v % 1 !== 0) return v.toFixed(2)
  return v.toLocaleString()
}

// ── Main entry ────────────────────────────────────────────────────────────────
export async function queryEngine(
  query: string,
  profile: DatasetProfile,
  aiEngine: AIEngine = 'gemini'
): Promise<DashboardResult> {
  const trimmed = query.trim()

  // Reject greetings
  if (trimmed.length < MIN_QUERY_LENGTH || GREETING_PATTERNS.test(trimmed)) {
    return greetingResult(query, profile)
  }

  const normalizedQuery = normalizeQuery(trimmed, profile)
  const topN = extractTopN(query)
  const prompt = buildPrompt(normalizedQuery, profile)

  // Pre-check: if clearly a known intent, use local engine directly
  // This avoids Gemini incorrectly returning out_of_scope for valid queries
  const q = normalizedQuery.toLowerCase()
  const preIsPayment = profile.hasPayments && /pay|card|wallet|cash|upi|debit|credit|method/i.test(q)
  const preIsRegion  = profile.hasRegions  && /region|country|location|territory/i.test(q)
  const preIsTrend   = profile.hasTimeSeries && /trend|over.?time|month|year|quarter|2022|2023/i.test(q)
  const preIsCategory = /categor|product|brand|type|segment|group/i.test(q)

  // For very short or simple intent queries, trust local engine
  if ((preIsPayment || preIsRegion || preIsTrend || preIsCategory) && normalizedQuery.split(' ').length <= 8) {
    return localEngine(normalizedQuery, profile, aiEngine, topN)
  }

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) throw new Error(`Server ${res.status}`)

    const data = await res.json() as { result: string }
    const raw   = data.result ?? ''
    const clean = raw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim()
    const jsonStart = clean.indexOf('{')
    const jsonEnd   = clean.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON in AI response')
    const json = JSON.parse(clean.slice(jsonStart, jsonEnd + 1)) as DashboardResult

    if (json.intent === 'out_of_scope') return oosResult(query, profile)

    // Sanitize column names in AI response text
    const sanitized: DashboardResult = {
      ...json,
      insight: sanitizeInsight(json.insight ?? '', profile),
      followups: sanitizeFollowups(
        mergeFollowups(json.followups, profile.smartSuggestions),
        profile
      ),
      aiEngine,
      isLocalFallback: false,
    }

    return applyTopN(sanitized, topN)

  } catch (e) {
    console.warn('AI fallback:', (e as Error).message)
    return localEngine(normalizedQuery, profile, aiEngine, topN)
  }
}

// ── Merge followups ───────────────────────────────────────────────────────────
function mergeFollowups(ai: string[], smart: string[]): string[] {
  const merged = [...(ai ?? [])]
  for (const s of smart) {
    if (merged.length >= 4) break
    if (!merged.some(f => f.toLowerCase().slice(0,20) === s.toLowerCase().slice(0,20))) merged.push(s)
  }
  return merged.slice(0,4)
}

// ── Apply top-N ───────────────────────────────────────────────────────────────
function applyTopN(result: DashboardResult, topN: number | null): DashboardResult {
  if (!topN) return result
  return {
    ...result,
    charts: result.charts?.map(ch => {
      if (ch.type === 'line') return ch
      const n = Math.min(topN, ch.labels.length)
      return {
        ...ch,
        labels: ch.labels.slice(0, n),
        title: ch.title.match(/top \d+/i) ? ch.title : `Top ${topN} — ${ch.title}`,
        datasets: ch.datasets.map(ds => ({ ...ds, data: ds.data.slice(0, n) })),
      }
    }) ?? [],
    table: result.table?.show ? { ...result.table, rows: result.table.rows.slice(0, topN) } : result.table,
  }
}

// ── Out of scope ──────────────────────────────────────────────────────────────
function oosResult(query: string, profile: DatasetProfile): DashboardResult {
  const cols = profile.categoricalCols.map(H).slice(0,3).join(', ')
  return {
    intent: 'out_of_scope',
    insight: `**"${query}"** is outside the scope of **${profile.name}**. Try asking about **${H(profile.primaryMetric)}**, **${H(profile.primaryDimension)}**, or columns: ${cols}.`,
    anomalies: [{ type: 'warn', text: 'Question outside dataset scope' }],
    kpis: [], charts: [], table: { show:false, headers:[], rows:[] },
    chartRecommendation: '',
    followups: profile.smartSuggestions.slice(0, 3),
    aiEngine: 'gemini', isLocalFallback: false,
  }
}

// ── Greeting result ───────────────────────────────────────────────────────────
function greetingResult(query: string, profile: DatasetProfile): DashboardResult {
  const dims = Object.keys(profile.aggregations.byPrimaryDimension).slice(0,3).join(', ')
  return {
    intent: 'out_of_scope',
    insight: `**"${query}"** isn't a data question. Try asking about **${H(profile.primaryDimension)}**: ${dims}, or ${H(profile.primaryMetric)}.`,
    anomalies: [{ type: 'warn', text: 'Not a data query — try a business question' }],
    kpis: [], charts: [], table: { show:false, headers:[], rows:[] },
    chartRecommendation: '',
    followups: profile.smartSuggestions.slice(0, 3),
    aiEngine: 'gemini', isLocalFallback: false,
  }
}

// ════════════════════════════════════════════════════════════════════════
// LOCAL ENGINE — dynamic, reads DatasetProfile
// ════════════════════════════════════════════════════════════════════════
function localEngine(query: string, p: DatasetProfile, ai: AIEngine, topN: number | null): DashboardResult {
  const q = query.toLowerCase()
  const agg = p.aggregations

  const isRegion  = p.hasRegions  && /region|country|geography|location|territory/i.test(q)
  const isPayment = p.hasPayments && /pay|card|wallet|cash|upi|debit|credit|method/i.test(q)
  const isTrend   = p.hasTimeSeries && /trend|over.?time|month|year|quarter|timeline|2022|2023|period|historical/i.test(q)
  const isRating  = /rating|star|review|score|satisfaction/i.test(q)
  const isDiscount= /discount|offer|deal|promo/i.test(q)

  if (isTrend)   return trendResult(query, p, ai, topN)
  if (isRegion)  return dimResult(query, p, ai, topN, Object.entries(agg.bySecondaryDimension).sort((a,b)=>b[1]-a[1]), p.columns.find(c=>/region|country/i.test(c.name))?.name ?? p.categoricalCols[1] ?? 'Region')
  if (isPayment) return dimResult(query, p, ai, topN, Object.entries(agg.bySecondaryDimension).sort((a,b)=>b[1]-a[1]), p.columns.find(c=>/pay|method/i.test(c.name))?.name ?? 'Payment Method')
  if (isRating || isDiscount) return ratingResult(query, p, ai, topN)
  return categoryResult(query, p, ai, topN)
}

function limitByTopN<T>(arr: T[], n: number | null): T[] { return n ? arr.slice(0,n) : arr }

// ── Category ──────────────────────────────────────────────────────────────────
function categoryResult(query: string, p: DatasetProfile, ai: AIEngine, topN: number | null): DashboardResult {
  const agg    = p.aggregations
  const raw    = [...agg.topDimensions].sort((a,b)=>b.value-a.value)
  const sorted = limitByTopN(raw, topN)
  const top    = sorted[0]
  const bottom = raw[raw.length-1]
  const chart1 = selectChartType(query, p, 'primary')
  const chart2 = selectChartType('compare bar', p, 'secondary')
  const label  = topN ? `Top ${topN}` : 'All'

  return {
    intent: 'category',
    insight: `**${top?.name}** leads **${H(p.primaryDimension)}** with **${fmtVal(top?.value??0)}** (${((top?.share??0)*100).toFixed(1)}% share). ${topN ? `Showing top ${topN} of ${raw.length}.` : `**${bottom?.name}** is lowest at **${fmtVal(bottom?.value??0)}**.`}`,
    anomalies: [
      { type:'info', text:`${top?.name} leads: ${((top?.share??0)*100).toFixed(1)}% share` },
      { type:'warn', text:`${bottom?.name} lowest — explore growth tactics` },
    ],
    kpis: buildCategoryKPIs(sorted, agg, p),
    chartRecommendation: chart1.reason,
    charts: [
      { type:chart1.type, title:`${label} ${H(p.primaryDimension)}s by ${H(p.primaryMetric)}`, subtitle:`Breakdown of ${fmtVal(agg.totalMetric)} total`, span:1, labels:sorted.map(d=>d.name), datasets:[{label:H(p.primaryMetric),data:sorted.map(d=>d.value),color:0}] },
      { type:chart2.type, title:`${H(p.primaryMetric)} vs Volume`, subtitle:'Revenue and count comparison', span:2, labels:sorted.map(d=>d.name), datasets:[{label:H(p.primaryMetric),data:sorted.map(d=>d.value),color:0},{label:'Count',data:sorted.map(d=>agg.countByDimension[d.name]??0),color:2}] },
    ],
    table: { show:true, headers:['#',H(p.primaryDimension),H(p.primaryMetric),'Share','Count'], rows:sorted.map((d,i)=>[i+1,d.name,fmtVal(d.value),`${(d.share*100).toFixed(1)}%`,(agg.countByDimension[d.name]??0).toLocaleString()]) },
    followups: sanitizeFollowups(mergeFollowups([],p.smartSuggestions), p),
    aiEngine: ai, isLocalFallback: false,
  }
}

// ── Trend ─────────────────────────────────────────────────────────────────────
function trendResult(query: string, p: DatasetProfile, ai: AIEngine, topN: number | null): DashboardResult {
  const ts   = p.aggregations.timeSeries
  if (!ts.length) return categoryResult(query, p, ai, topN)
  const vals  = ts.map(t=>t.value)
  const maxI  = vals.indexOf(Math.max(...vals))
  const minI  = vals.indexOf(Math.min(...vals))
  const total = vals.reduce((a,b)=>a+b,0)
  const years = [...new Set(ts.map(t=>t.period.split('-')[0]))]
  const datasets = years.length > 1
    ? years.map((yr,i)=>({ label:yr, data:ts.filter(t=>t.period.startsWith(yr)).map(t=>t.value), color:i }))
    : [{ label:H(p.primaryMetric), data:vals, color:0 }]
  const labels = years.length > 1 ? MONTHS_SHORT : ts.map(t=>formatPeriodLabel(t.period))

  return {
    intent: 'trend',
    insight: `Over **${ts.length} periods**, total **${H(p.primaryMetric)}** = **${fmtVal(total)}**. Peak: **${formatPeriodLabel(ts[maxI].period)}** at **${fmtVal(ts[maxI].value)}**. Lowest: **${formatPeriodLabel(ts[minI].period)}** at **${fmtVal(ts[minI].value)}**.`,
    anomalies: [
      { type:'info', text:`Peak: ${formatPeriodLabel(ts[maxI].period)} — investigate drivers` },
      { type:'warn', text:`Dip: ${formatPeriodLabel(ts[minI].period)} — check seasonality` },
    ],
    kpis: [
      { label:'Total', value:fmtVal(total), sub:`${ts.length} periods`, trend:'up', color:'c1' },
      { label:'Peak Month', value:formatPeriodLabel(ts[maxI].period), sub:fmtVal(ts[maxI].value), trend:'up', color:'c2' },
      { label:'Monthly Avg', value:fmtVal(total/ts.length), sub:'average', trend:'none', color:'c3' },
      { label:'Periods', value:ts.length.toString(), sub:'data points', trend:'none', color:'c4' },
    ],
    chartRecommendation: 'Line chart — best for showing trends, seasonality, and year-over-year comparison.',
    charts: [
      { type:'line', title:`${H(p.primaryMetric)} Over Time`, subtitle:years.length>1?'Year-over-year comparison':`${ts.length}-period trend`, span:2, labels, datasets },
      { type:'bar', title:'Order Volume by Period', subtitle:'Transaction count per period', span:1, labels:ts.map(t=>formatPeriodLabel(t.period)), datasets:[{label:'Orders',data:ts.map(t=>t.count),color:2}] },
    ],
    table: { show:false, headers:[], rows:[] },
    followups: sanitizeFollowups(mergeFollowups([],p.smartSuggestions), p),
    aiEngine: ai, isLocalFallback: false,
  }
}

// ── Dimension (region/payment) ────────────────────────────────────────────────
function dimResult(query:string, p:DatasetProfile, ai:AIEngine, topN:number|null, rawEntries:[string,number][], dimName:string): DashboardResult {
  const sorted = limitByTopN(rawEntries, topN)
  const total  = rawEntries.reduce((s,[,v])=>s+v,0)
  const chart  = selectChartType(query, p, 'primary')
  return {
    intent: 'region',
    insight: `**${sorted[0]?.[0]}** leads all **${H(dimName)}**s at **${fmtVal(sorted[0]?.[1]??0)}** (${((sorted[0]?.[1]??0)/total*100).toFixed(1)}% share). ${topN?`Showing top ${topN} of ${rawEntries.length}.`:''}`,
    anomalies: [
      { type:'info', text:`${sorted[0]?.[0]} leads: ${((sorted[0]?.[1]??0)/total*100).toFixed(1)}% share` },
      { type:'warn', text:`${rawEntries[rawEntries.length-1]?.[0]} lowest — growth opportunity` },
    ],
    kpis: [
      { label:`Top ${H(dimName)}`, value:sorted[0]?.[0]??'—', sub:fmtVal(sorted[0]?.[1]??0), trend:'up', color:'c1' },
      { label:'Total', value:fmtVal(total), sub:'all groups', trend:'up', color:'c2' },
      { label:'Groups', value:sorted.length.toString(), sub:'shown', trend:'none', color:'c3' },
      { label:'Average', value:fmtVal(total/Math.max(rawEntries.length,1)), sub:'per group', trend:'none', color:'c4' },
    ],
    chartRecommendation: chart.reason,
    charts: [{ type:chart.type, title:`${H(p.primaryMetric)} by ${H(dimName)}`, subtitle:`${topN?`Top ${topN} — `:''}Distribution`, span:1, labels:sorted.map(x=>x[0]), datasets:[{label:H(p.primaryMetric),data:sorted.map(x=>x[1]),color:0}] }],
    table: { show:true, headers:['#',H(dimName),H(p.primaryMetric),'Share'], rows:sorted.map(([name,val],i)=>[i+1,name,fmtVal(val),`${(val/total*100).toFixed(1)}%`]) },
    followups: sanitizeFollowups(mergeFollowups([],p.smartSuggestions), p),
    aiEngine: ai, isLocalFallback: false,
  }
}

// ── Rating/Discount ───────────────────────────────────────────────────────────
function ratingResult(query:string, p:DatasetProfile, ai:AIEngine, topN:number|null): DashboardResult {
  const sorted = limitByTopN([...p.aggregations.topDimensions].sort((a,b)=>b.value-a.value), topN)
  return {
    intent: 'rating',
    insight: `Comparing **${H(p.primaryDimension)}** performance. **${sorted[0]?.name}** leads at **${fmtVal(sorted[0]?.value??0)}**. ${topN?`Showing top ${topN} of ${p.aggregations.topDimensions.length}.`:''}`,
    anomalies: [{ type:'info', text:`${sorted[0]?.name} leads — check what drives performance` }],
    kpis: [
      { label:'Top', value:sorted[0]?.name??'—', sub:fmtVal(sorted[0]?.value??0), trend:'up', color:'c1' },
      { label:'Total', value:fmtVal(p.aggregations.totalMetric), sub:H(p.primaryMetric), trend:'up', color:'c2' },
      { label:'Shown', value:sorted.length.toString(), sub:`of ${p.aggregations.topDimensions.length}`, trend:'none', color:'c3' },
      { label:'Average', value:fmtVal(p.aggregations.avgMetric), sub:'per record', trend:'none', color:'c4' },
    ],
    chartRecommendation: 'Horizontal bar — best for ranking categories clearly.',
    charts: [{ type:'horizontalBar', title:`${H(p.primaryDimension)} Comparison`, subtitle:'Ranked by value', span:2, labels:sorted.map(d=>d.name), datasets:[{label:H(p.primaryMetric),data:sorted.map(d=>d.value),color:0}] }],
    table: { show:true, headers:['#',H(p.primaryDimension),H(p.primaryMetric),'Share'], rows:sorted.map((d,i)=>[i+1,d.name,fmtVal(d.value),`${(d.share*100).toFixed(1)}%`]) },
    followups: sanitizeFollowups(mergeFollowups([],p.smartSuggestions), p),
    aiEngine: ai, isLocalFallback: false,
  }
}

// ── KPI helpers ───────────────────────────────────────────────────────────────
function buildCategoryKPIs(sorted: DatasetProfile['aggregations']['topDimensions'], agg: DatasetProfile['aggregations'], p: DatasetProfile): KPI[] {
  return [
    { label:`Top ${H(p.primaryDimension)}`, value:sorted[0]?.name??'—', sub:fmtVal(sorted[0]?.value??0), trend:'up', color:'c1' },
    { label:`Total ${H(p.primaryMetric)}`, value:fmtVal(agg.totalMetric), sub:'all categories', trend:'up', color:'c2' },
    { label:'Categories', value:sorted.length.toString(), sub:'shown', trend:'none', color:'c3' },
    { label:'Average', value:fmtVal(agg.totalMetric/Math.max(sorted.length,1)), sub:'per category', trend:'none', color:'c4' },
  ]
}

// ─── Dataset & Column Intelligence ───────────────────────────────────────────

export type ColumnType = 'numeric' | 'categorical' | 'date' | 'id' | 'boolean' | 'text'

export interface ColumnProfile {
  name: string
  type: ColumnType
  uniqueCount: number
  nullCount: number
  sampleValues: (string | number)[]
  min?: number
  max?: number
  mean?: number
  topValues?: Array<{ value: string; count: number; sum: number }>
  isHighCardinality: boolean // >50 unique = bad groupby candidate
}

export interface DatasetProfile {
  name: string
  rowCount: number
  columns: ColumnProfile[]
  numericCols: string[]
  categoricalCols: string[]
  dateCols: string[]
  idCols: string[]
  primaryMetric: string       // best numeric col (last/largest sums)
  primaryDimension: string    // best categorical col
  dateColumn: string | null
  hasTimeSeries: boolean
  hasCategories: boolean
  hasRegions: boolean
  hasPayments: boolean
  smartSuggestions: string[]
  aggregations: DatasetAggregations
}

export interface DatasetAggregations {
  byPrimaryDimension: Record<string, number>
  bySecondaryDimension: Record<string, number>
  byDate: Record<string, number>
  byDateAndDimension: Record<string, Record<string, number>>
  countByDimension: Record<string, number>
  totalMetric: number
  avgMetric: number
  topDimensions: Array<{ name: string; value: number; share: number }>
  timeSeries: Array<{ period: string; value: number; count: number }>
  crossTab: Record<string, Record<string, number>>
  byPaymentDimension?: Record<string, number>
}

// ─── AI Response ──────────────────────────────────────────────────────────────

export type ChartType = 'line' | 'bar' | 'horizontalBar' | 'doughnut' | 'radar' | 'scatter'
export type AnomalyType = 'warn' | 'info' | 'danger'
export type TrendType = 'up' | 'dn' | 'none'
export type AIEngine = 'gemini'
export type QueryIntent =
  | 'revenue' | 'category' | 'region' | 'payment' | 'trend'
  | 'comparison' | 'rating' | 'discount' | 'top_n' | 'custom' | 'out_of_scope'

export interface KPI {
  label: string
  value: string
  sub: string
  trend: TrendType
  color: 'c1' | 'c2' | 'c3' | 'c4'
}

export interface ChartDataset {
  label: string
  data: number[]
  color: number
}

export interface ChartConfig {
  type: ChartType
  title: string
  subtitle: string
  span: 1 | 2
  labels: string[]
  datasets: ChartDataset[]
}

export interface Anomaly {
  type: AnomalyType
  text: string
}

export interface TableData {
  show: boolean
  headers: string[]
  rows: (string | number)[][]
}

export interface DashboardResult {
  intent: QueryIntent
  insight: string
  anomalies: Anomaly[]
  kpis: KPI[]
  chartRecommendation: string
  charts: ChartConfig[]
  table: TableData
  followups: string[]
  aiEngine: AIEngine
  isLocalFallback: boolean
}

// ─── App State ────────────────────────────────────────────────────────────────

export interface Thread {
  id: string
  query: string
  result: DashboardResult
  timestamp: number
}

export interface Tab {
  id: string
  name: string
  threads: Thread[]
  dataset: DatasetProfile | null
}

export interface AppState {
  tabs: Tab[]
  activeTabId: string
  activeAI: AIEngine
  isLoading: boolean
  thinkStep: number
  theme: 'dark' | 'light'

  // Actions
  setTheme: (t: 'dark' | 'light') => void
  setActiveAI: (ai: AIEngine) => void
  setLoading: (v: boolean) => void
  setThinkStep: (s: number) => void
  addTab: (tab: Tab) => void
  closeTab: (id: string) => void
  switchTab: (id: string) => void
  addThread: (tabId: string, thread: Thread) => void
  clearThreads: (tabId: string) => void
  setDataset: (tabId: string, profile: DatasetProfile) => void
  updateTabName: (tabId: string, name: string) => void
}

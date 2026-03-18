# FLOW — AI Business Intelligence Dashboard

> Ask any business question in plain English. Get a fully interactive dashboard instantly.

---

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env.local
# Then edit .env.local and add your Gemini API key

# 3. Run development server
npm run dev

# 4. Open http://localhost:3000
```

---

## Deploy to Vercel (Free)

```bash
# Option A — Vercel CLI
npm i -g vercel
vercel

# Option B — GitHub
# 1. Push this folder to a GitHub repo
# 2. Go to vercel.com → New Project → Import your repo
# 3. Click Deploy (zero config needed)
```

**Add API Keys on Vercel:**
1. Dashboard → Your Project → Settings → Environment Variables
2. Add: `GEMINI_API_KEY` = your key
3. Redeploy

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx              ← Main app page (orchestrates everything)
│   ├── layout.tsx            ← Root layout + theme
│   ├── globals.css           ← All CSS variables + styles (dark/light)
│   └── api/query/route.ts    ← Backend: Gemini / OpenAI / Claude proxy
│
├── components/
│   ├── layout/
│   │   ├── Header.tsx        ← Logo, tabs, AI selector, theme toggle
│   │   └── QueryDock.tsx     ← Sticky query input + voice + suggestions
│   ├── dashboard/
│   │   └── ThreadItem.tsx    ← Full result: charts, KPIs, table, followups
│   └── ui/
│       └── index.tsx         ← ThinkingBar, EmptyState, VoiceOverlay, Toast
│
├── lib/
│   ├── engine.ts             ← AI orchestrator + dynamic local fallback
│   ├── dataAnalyzer.ts       ← Column type detection for ANY CSV
│   ├── csvProcessor.ts       ← CSV → DatasetProfile (works for any file)
│   ├── promptBuilder.ts      ← Builds AI prompts from dataset profile
│   └── chartSelector.ts      ← Smart chart type selection logic
│
├── store/
│   └── appStore.ts           ← Zustand global state (tabs, threads, AI, theme)
│
└── types/
    └── index.ts              ← All TypeScript interfaces
```

---

## How the Dynamic Dataset System Works

When you upload **any CSV file**, FLOW:

1. **Detects column types automatically** (`dataAnalyzer.ts`)
   - Numeric, categorical, date, ID, boolean, text
   - No hardcoded column names

2. **Identifies semantic roles** (`dataAnalyzer.ts`)
   - Which column is revenue? Which is region? Payment method? Rating?
   - Uses pattern matching on column names

3. **Builds a DatasetProfile** (`csvProcessor.ts`)
   - Primary metric (best numeric column)
   - Primary dimension (best groupby column)
   - All aggregations: by dimension, by date, cross-tab
   - Smart suggestions specific to this dataset

4. **Generates context-aware follow-up suggestions** (`csvProcessor.ts`)
   - Based on actual column names, not hardcoded Amazon questions

5. **Local engine reads from profile** (`engine.ts`)
   - If AI is unavailable, falls back to a rule-based engine
   - The rules read `DatasetProfile` — so they work for Flipkart, hospital data, anything

---

## AI Engines

| Engine | Model | Key Env Var |
|--------|-------|------------|
| Gemini (default) | gemini-2.0-flash | `GEMINI_API_KEY` |
| OpenAI | gpt-4o-mini | `OPENAI_API_KEY` |
| Claude | claude-haiku | `ANTHROPIC_API_KEY` |

You only need **one key** to use FLOW. Gemini is free tier.

---

## Features

- **Natural language → Dashboard** — no SQL needed
- **Multi AI layer** — Gemini, GPT-4o, Claude switchable mid-session
- **Fully dynamic CSV** — upload any CSV, FLOW adapts automatically
- **Smart chart selection** — correct chart type per query, with reasoning shown
- **Download charts** — every chart has a PNG download button
- **Voice input** — speak your query (Chrome/Edge)
- **Voice output** — AI reads results aloud
- **Multi-tab** — run parallel analyses in separate tabs
- **Dark / Light mode** — persists across sessions
- **Auto-scroll** — jumps to result after each query
- **Loading animation** — step-by-step progress bar
- **Follow-up chips** — contextual, dataset-aware suggestions

---

## Three Demo Queries for Presentation

1. `"Show revenue breakdown by product category"` — doughnut + bar
2. `"Monthly revenue trends 2022 vs 2023"` — line chart YoY
3. `"Which region has the highest revenue and what drives it"` — multi-chart + table

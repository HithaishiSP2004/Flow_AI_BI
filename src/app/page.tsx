'use client'
import { useEffect, useRef, useCallback, useState } from 'react'
import { useAppStore, useActiveTab, useActiveDataset } from '@/store/appStore'
import { queryEngine } from '@/lib/engine'
import { processDataset, AMAZON_PROFILE } from '@/lib/csvProcessor'
import type { Thread } from '@/types'
import { ThinkingBar, EmptyState, Toast } from '@/components/ui/index'
import ThreadItem from '@/components/dashboard/ThreadItem'

const PLACEHOLDERS = [
  'Show revenue breakdown by category…',
  'Monthly sales trends 2022 vs 2023…',
  'Top 3 categories by revenue…',
  'Sales breakdown by region…',
  'Which payment method performs best?',
  'Highest rated product categories…',
]

const SUGGEST_CHIPS = [
  'Revenue breakdown by product category',
  'Monthly revenue trends 2022 vs 2023',
  'Sales breakdown by region',
  'Revenue by payment method',
  'Top 3 categories by revenue',
]

export default function Page() {
  const {
    tabs, activeTabId, theme, isLoading, thinkStep,
    setTheme, setLoading, setThinkStep,
    addThread, addTab, setDataset, updateTabName, clearThreads, switchTab, closeTab,
  } = useAppStore()

  const activeTab  = useActiveTab()
  const dataset    = useActiveDataset()
  const toastRef   = useRef<(msg: string) => void>(() => {})
  const thinkTimer = useRef<NodeJS.Timeout>()
  const [query, setQuery]             = useState('')
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceText, setVoiceText]     = useState('')
  const [phIdx, setPhIdx]             = useState(0)
  const [phFade, setPhFade]           = useState(true)
  const recRef  = useRef<SpeechRecognition | null>(null)
  const vtRef   = useRef('')
  const taRef   = useRef<HTMLTextAreaElement>(null)
  const hasResults = activeTab.threads.length > 0

  // Apply theme
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])

  // Animated placeholder cycle
  useEffect(() => {
    const iv = setInterval(() => {
      setPhFade(false)
      setTimeout(() => { setPhIdx(i => (i+1) % PLACEHOLDERS.length); setPhFade(true) }, 350)
    }, 3000)
    return () => clearInterval(iv)
  }, [])

  // ── Animated chart background canvas ────────────────────────────────────────
  useEffect(() => {
    const canvas = document.getElementById('bg-canvas') as HTMLCanvasElement
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf: number
    let W = window.innerWidth, H = window.innerHeight
    canvas.width = W; canvas.height = H
    const onResize = () => { W=window.innerWidth; H=window.innerHeight; canvas.width=W; canvas.height=H }
    window.addEventListener('resize', onResize)

    // Generate multiple line chart paths that animate slowly
    const NUM_LINES = 5
    interface ChartLine {
      points: number[]
      color: string
      lightColor: string
      offset: number
      speed: number
      amplitude: number
      baseY: number
      phase: number
    }

    const lines: ChartLine[] = [
      { points:[], color:'rgba(108,95,255,0.18)', lightColor:'rgba(79,63,232,0.12)', offset:0,   speed:0.004, amplitude:60,  baseY:.30, phase:0 },
      { points:[], color:'rgba(255,92,155,0.13)', lightColor:'rgba(212,56,120,0.08)', offset:0.3, speed:0.003, amplitude:45,  baseY:.50, phase:1.2 },
      { points:[], color:'rgba(0,223,162,0.12)',  lightColor:'rgba(10,158,116,0.08)', offset:0.6, speed:0.005, amplitude:55,  baseY:.68, phase:2.4 },
      { points:[], color:'rgba(255,179,71,0.10)', lightColor:'rgba(196,120,0,0.07)',  offset:0.2, speed:0.0035,amplitude:40,  baseY:.20, phase:0.8 },
      { points:[], color:'rgba(108,95,255,0.08)', lightColor:'rgba(79,63,232,0.06)', offset:0.8, speed:0.0025,amplitude:35,  baseY:.82, phase:1.8 },
    ]

    // Grid dots
    const GRID_COLS = Math.ceil(W/90)
    const GRID_ROWS = Math.ceil(H/90)

    let t = 0
    const draw = () => {
      ctx.clearRect(0,0,W,H)
      const isDark = document.documentElement.dataset.theme !== 'light'
      t += 1

      // Subtle grid dots
      const dotAlpha = isDark ? 0.06 : 0.04
      ctx.fillStyle = isDark ? `rgba(150,140,255,${dotAlpha})` : `rgba(80,60,200,${dotAlpha})`
      for (let r = 0; r <= GRID_ROWS; r++) {
        for (let col = 0; col <= GRID_COLS; col++) {
          ctx.beginPath()
          ctx.arc(col*90, r*90, 1, 0, Math.PI*2)
          ctx.fill()
        }
      }

      // Animated line charts
      lines.forEach(line => {
        const numPts = 14
        const stepX  = W / (numPts - 1)
        const baseY  = line.baseY * H

        // Build smooth path
        ctx.beginPath()
        for (let i = 0; i < numPts; i++) {
          const x = i * stepX
          // Multi-frequency wave for natural chart look
          const y = baseY
            - Math.sin((i * 0.55 + t * line.speed + line.phase) ) * line.amplitude
            - Math.sin((i * 0.28 + t * line.speed * 0.7 + line.phase * 1.3)) * line.amplitude * 0.4
            - Math.sin((i * 0.9  + t * line.speed * 1.4 + line.phase * 0.7)) * line.amplitude * 0.2
          if (i === 0) ctx.moveTo(x, y)
          else {
            // Smooth bezier curve
            const px = (i-1) * stepX
            const py = baseY
              - Math.sin(((i-1) * 0.55 + t * line.speed + line.phase)) * line.amplitude
              - Math.sin(((i-1) * 0.28 + t * line.speed * 0.7 + line.phase * 1.3)) * line.amplitude * 0.4
              - Math.sin(((i-1) * 0.9  + t * line.speed * 1.4 + line.phase * 0.7)) * line.amplitude * 0.2
            const cpx = (px + x) / 2
            ctx.bezierCurveTo(cpx, py, cpx, y, x, y)
          }
        }
        ctx.strokeStyle = isDark ? line.color : line.lightColor
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Draw small data point dots at each vertex
        for (let i = 0; i < numPts; i++) {
          const x = i * stepX
          const y = baseY
            - Math.sin((i * 0.55 + t * line.speed + line.phase)) * line.amplitude
            - Math.sin((i * 0.28 + t * line.speed * 0.7 + line.phase * 1.3)) * line.amplitude * 0.4
            - Math.sin((i * 0.9  + t * line.speed * 1.4 + line.phase * 0.7)) * line.amplitude * 0.2
          // Only draw dots at every 3rd point to keep it subtle
          if (i % 3 === 0) {
            ctx.beginPath()
            ctx.arc(x, y, 2.5, 0, Math.PI*2)
            ctx.fillStyle = isDark ? line.color.replace('0.18','0.35').replace('0.13','0.28').replace('0.12','0.25').replace('0.10','0.22').replace('0.08','0.18') : line.lightColor.replace('0.12','0.22').replace('0.08','0.16').replace('0.07','0.14').replace('0.06','0.12')
            ctx.fill()
          }
        }
      })

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [])

  // ── Thinking animation ──────────────────────────────────────────────────────
  const startThinking = useCallback(() => {
    setLoading(true); setThinkStep(0)
    document.getElementById('genprog')?.classList.add('active')
    let s = 0
    thinkTimer.current = setInterval(() => { if(s<4){s++;setThinkStep(s)} }, 700)
  }, [setLoading, setThinkStep])

  const stopThinking = useCallback(() => {
    clearInterval(thinkTimer.current); setThinkStep(5)
    setTimeout(() => { setLoading(false); document.getElementById('genprog')?.classList.remove('active') }, 400)
  }, [setLoading, setThinkStep])

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleQuery = useCallback(async (q: string) => {
    if (!q.trim() || isLoading) return
    setQuery('')
    if (taRef.current) taRef.current.style.height = 'auto'
    startThinking()
    try {
      const result = await queryEngine(q, dataset, 'gemini')
      const thread: Thread = { id:`t-${Date.now()}`, query:q, result, timestamp:Date.now() }
      addThread(activeTabId, thread)
      if (activeTab.threads.length === 0) updateTabName(activeTabId, q.slice(0,28)+(q.length>28?'…':''))
      setTimeout(() => document.getElementById(thread.id)?.scrollIntoView({behavior:'smooth',block:'start'}), 120)
    } catch(e) { toastRef.current?.(`Error: ${(e as Error).message}`) }
    finally { stopThinking() }
  }, [isLoading, dataset, activeTabId, activeTab.threads.length, startThinking, stopThinking, addThread, updateTabName])

  // ── Voice ───────────────────────────────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    const SR = ((window as Record<string,unknown>).SpeechRecognition || (window as Record<string,unknown>).webkitSpeechRecognition) as typeof SpeechRecognition
    if (!SR) { toastRef.current?.('Voice not supported. Use Chrome.'); return }
    if (recRef.current) { recRef.current.abort(); return }
    const rec = new SR(); rec.continuous=false; rec.interimResults=true; rec.lang='en-US'
    recRef.current = rec; vtRef.current = ''
    rec.onstart  = () => { setVoiceActive(true); setVoiceText('Listening…') }
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let final='', interim=''
      for (let i=e.resultIndex; i<e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final+=t; else interim+=t
      }
      const cur = final||interim; vtRef.current=cur; setVoiceText(cur||'Listening…')
    }
    rec.onend = () => {
      const t = vtRef.current.trim()
      setVoiceActive(false); setVoiceText(''); recRef.current=null
      if (t) setTimeout(()=>handleQuery(t), 150)
    }
    rec.onerror = () => { setVoiceActive(false); setVoiceText(''); recRef.current=null }
    rec.start()
  }, [handleQuery])

  // ── CSV ─────────────────────────────────────────────────────────────────────
  const handleCSV = useCallback((file: File) => {
    toastRef.current?.(`Loading ${file.name}…`)
    import('papaparse').then(({default:Papa}) => {
      Papa.parse(file, {
        header:true, dynamicTyping:true, skipEmptyLines:true,
        complete(res) {
          try {
            const rows = res.data as Record<string,unknown>[]
            if (!rows.length) { toastRef.current?.('CSV is empty'); return }
            const profile = processDataset(rows, file.name)
            const tabId   = `tab-${Date.now()}`
            addTab({ id:tabId, name:profile.name.slice(0,20), threads:[], dataset:profile })
            setDataset(tabId, profile)
            toastRef.current?.(`✓ ${file.name} — ${rows.length.toLocaleString()} rows`)
          } catch(e) { toastRef.current?.(`CSV error: ${(e as Error).message}`) }
        },
        error:(e:Error) => toastRef.current?.(`Parse error: ${e.message}`),
      })
    })
  }, [addTab, setDataset])

  const resize = () => {
    const el = taRef.current
    if (el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,100)+'px' }
  }

  return (
    <>
      {/* Animated chart background */}
      <canvas id="bg-canvas" style={{position:'fixed',inset:0,zIndex:0,pointerEvents:'none'}}/>
      <div className="gen-progress" id="genprog"/>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="header-left">
          <span className="logo">FLOW</span>
          <span className="logo-sub">AI Business Intelligence</span>
        </div>
        <div className="tab-bar">
          {tabs.map(t=>(
            <div key={t.id} className={`tab ${t.id===activeTabId?'active':''}`} onClick={()=>switchTab(t.id)}>
              <span className="tab-name">{t.name}</span>
              <button className="tab-close" onClick={e=>{e.stopPropagation();closeTab(t.id)}}>×</button>
            </div>
          ))}
          <button className="tab-new" onClick={()=>addTab({id:`tab-${Date.now()}`,name:'New chart',threads:[],dataset:AMAZON_PROFILE})}>+ New</button>
        </div>
        <div className="header-right">
          <div className="data-badge">
            <div className="live-dot"/>
            <span>{dataset.name} · {dataset.rowCount.toLocaleString()} rows</span>
          </div>
          <label className="hdr-btn" title="Upload CSV" style={{cursor:'pointer'}}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <input type="file" accept=".csv" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleCSV(f);e.target.value=''}}/>
          </label>
          <button className="hdr-btn" title="Clear results" onClick={()=>clearThreads(activeTabId)}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
            </svg>
          </button>
          <button className="hdr-btn" title="Toggle theme" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>
            {theme==='dark'
              ? <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              : <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
            }
          </button>
        </div>
      </header>

      {/* ── MAIN ─────────────────────────────────────────────────────────────── */}
      <main>
        {/* Hero — hidden after first result */}
        {!hasResults && (
          <section className="hero">
            <h1 className="hero-headline">
              <span className="hl-white">Go with</span>
              <span className="hl-grad">Flow.</span>
            </h1>
            <p className="hero-sub">
              Ask Your Data. Get Instant Insights.
            </p>
          </section>
        )}

        {/* Query box */}
        <div className={`query-section ${hasResults ? 'results-mode' : ''}`}>
          <div className="query-wrap">
            <div className="query-pill">
              {/* Mic */}
              <button
                className={`mic-btn ${voiceActive ? 'listening' : ''}`}
                onClick={toggleVoice}
                title="Voice input"
              >
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="9" y="2" width="6" height="11" rx="3"/>
                  <path d="M19 10a7 7 0 0 1-14 0"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="8" y1="22" x2="16" y2="22"/>
                </svg>
              </button>

              {/* Voice indicator — inline, minimal */}
              {voiceActive && (
                <span style={{fontSize:'.75rem',color:'var(--a2)',whiteSpace:'nowrap',fontFamily:"'JetBrains Mono',monospace"}}>
                  🎤 {voiceText}
                </span>
              )}

              {/* Input area with animated placeholder */}
              <div style={{flex:1,position:'relative',display:'flex',alignItems:'center'}}>
                <textarea
                  ref={taRef}
                  value={query}
                  rows={1}
                  className="q-input"
                  onChange={e=>{setQuery(e.target.value);resize()}}
                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleQuery(query)}}}
                />
                {query.length === 0 && !voiceActive && (
                  <span
                    className="q-placeholder"
                    style={{opacity: phFade ? 1 : 0}}
                  >
                    {PLACEHOLDERS[phIdx]}
                  </span>
                )}
              </div>

              {/* Send */}
              <button
                className={`q-send ${isLoading ? 'loading' : ''}`}
                onClick={()=>handleQuery(query)}
              >
                <svg viewBox="0 0 24 24" fill="white" width="17" height="17">
                  <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/>
                </svg>
              </button>
            </div>

            {/* Suggestion chips */}
            {!hasResults && (
              <div className="chip-row">
                {SUGGEST_CHIPS.map((s,i) => (
                  <button key={i} className="s-chip" onClick={()=>{setQuery(s);setTimeout(()=>handleQuery(s),50)}}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <ThinkingBar visible={isLoading} step={thinkStep}/>
          </div>
        </div>

        {/* Dashboard results */}
        <div id="dashboard-area" style={{marginTop:'1.5rem'}}>
          {activeTab.threads.length === 0
            ? <EmptyState/>
            : activeTab.threads.map((thread,i) => (
                <ThreadItem key={thread.id} thread={thread} index={i} onFollowUp={handleQuery}/>
              ))
          }
        </div>
      </main>

      <Toast ref={toastRef}/>
    </>
  )
}

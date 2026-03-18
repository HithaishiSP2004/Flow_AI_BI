'use client'
import { useEffect, useRef } from 'react'
import type { Thread, DashboardResult, ChartConfig } from '@/types'
import { Chart, registerables } from 'chart.js'

const COLORS = ['#5b4fff','#ff4f81','#00c896','#f5a623','#64b5f6','#ce93d8']
const CALPHA  = COLORS.map(c => c + '28')

function fv(v: number | string): string {
  if (typeof v !== 'number') return String(v)
  if (v >= 1e9) return `$${(v/1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v/1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`
  if (v !== 0 && Math.abs(v) < 100 && v % 1 !== 0) return v.toFixed(2)
  return v.toLocaleString()
}

// ── Download CSV from table data ──────────────────────────────────────────────
function downloadCSV(headers: string[], rows: (string|number)[][], filename: string) {
  const escape = (v: string|number) => {
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s
  }
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = filename.replace(/\s+/g,'-') + '.csv'; a.click()
  URL.revokeObjectURL(a.href)
}

// ── ChartCard ─────────────────────────────────────────────────────────────────
function ChartCard({ ch, cid, isFirst, recommendation, tableHeaders, tableRows }: {
  ch: ChartConfig; cid: string; isFirst: boolean; recommendation: string
  tableHeaders: string[]; tableRows: (string|number)[][]
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<Chart | null>(null)

  useEffect(() => {
    Chart.register(...registerables)
    if (!canvasRef.current) return
    const isDark    = document.documentElement.dataset.theme !== 'light'
    const tickColor = isDark ? '#8888aa' : '#44446a'
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
    const tipBase   = {
      backgroundColor : isDark ? 'rgba(14,14,26,0.97)' : 'rgba(255,255,255,0.97)',
      borderColor     : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      borderWidth:1, padding:12, cornerRadius:10,
      titleColor: isDark?'#eeeef8':'#0c0c18',
      bodyColor : isDark?'#8888aa':'#44446a',
    }
    if (chartRef.current) chartRef.current.destroy()

    const dsCfg = (ds: ChartConfig['datasets'][0], i: number) => {
      const col = COLORS[(ds.color||i)%COLORS.length]
      const alp = CALPHA[(ds.color||i)%COLORS.length]
      const solo = ch.datasets.length === 1
      return {
        label:ds.label, data:ds.data,
        backgroundColor: ch.type==='line' ? alp : (solo&&ch.type!=='bar' ? COLORS.slice(0,Math.max(ds.data.length,6)) : col),
        borderColor:col, borderWidth:ch.type==='line'?2:1,
        borderRadius:['bar','horizontalBar'].includes(ch.type)?5:0,
        pointBackgroundColor:col, pointRadius:ch.type==='line'?4:0, pointHoverRadius:ch.type==='line'?7:0,
        fill:ch.type==='line'?{target:'origin',above:alp}:false, tension:.4,
      }
    }

    if (ch.type === 'doughnut') {
      chartRef.current = new Chart(canvasRef.current, {
        type:'doughnut',
        data:{labels:ch.labels,datasets:[{data:ch.datasets[0].data,backgroundColor:COLORS.slice(0,ch.labels.length),borderColor:'rgba(0,0,0,0)',borderWidth:3,hoverOffset:10}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
          plugins:{legend:{position:'right',labels:{color:tickColor,font:{size:11},boxWidth:10}},
            tooltip:{...tipBase,callbacks:{label:(c)=>{const tot=(c.dataset.data as number[]).reduce((a,b)=>a+b,0);return ` ${c.label}: ${fv(c.parsed as number)} (${((c.parsed as number)/tot*100).toFixed(1)}%)`}}}}}
      })
    } else if (ch.type === 'radar') {
      chartRef.current = new Chart(canvasRef.current, {
        type:'radar',
        data:{labels:ch.labels,datasets:ch.datasets.map((ds,i)=>({...dsCfg(ds,i),backgroundColor:CALPHA[i],borderColor:COLORS[i],borderWidth:2}))},
        options:{responsive:true,maintainAspectRatio:false,
          scales:{r:{grid:{color:gridColor},pointLabels:{color:tickColor,font:{size:11}},ticks:{display:false,backdropColor:'transparent'},angleLines:{color:gridColor}}},
          plugins:{legend:{display:ch.datasets.length>1,labels:{color:tickColor}},tooltip:tipBase}}
      })
    } else if (ch.type === 'horizontalBar') {
      chartRef.current = new Chart(canvasRef.current, {
        type:'bar',
        data:{labels:ch.labels,datasets:ch.datasets.map(dsCfg)},
        options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
          scales:{x:{grid:{color:gridColor},ticks:{callback:(v)=>fv(v as number),color:tickColor}},y:{grid:{display:false},ticks:{color:tickColor,font:{size:11}}}},
          plugins:{legend:{display:ch.datasets.length>1,labels:{color:tickColor}},tooltip:{...tipBase,callbacks:{label:(c)=>` ${c.dataset.label}: ${fv(c.parsed.x)}`}}}}
      })
    } else if (ch.type === 'line') {
      chartRef.current = new Chart(canvasRef.current, {
        type:'line',
        data:{labels:ch.labels,datasets:ch.datasets.map(dsCfg)},
        options:{responsive:true,maintainAspectRatio:false,
          scales:{x:{grid:{display:false},ticks:{color:tickColor,maxTicksLimit:13}},y:{grid:{color:gridColor},ticks:{callback:(v)=>fv(v as number),color:tickColor}}},
          plugins:{legend:{position:'top',labels:{color:tickColor,usePointStyle:true,padding:16}},tooltip:{...tipBase,callbacks:{label:(c)=>` ${c.dataset.label}: ${fv(c.parsed.y)}`}}}}
      })
    } else {
      chartRef.current = new Chart(canvasRef.current, {
        type:'bar',
        data:{labels:ch.labels,datasets:ch.datasets.map(dsCfg)},
        options:{responsive:true,maintainAspectRatio:false,
          scales:{x:{grid:{display:false},ticks:{color:tickColor,maxTicksLimit:10}},y:{grid:{color:gridColor},ticks:{callback:(v)=>fv(v as number),color:tickColor}}},
          plugins:{legend:{display:ch.datasets.length>1,labels:{color:tickColor,usePointStyle:true,padding:16}},tooltip:{...tipBase,callbacks:{label:(c)=>` ${c.dataset.label}: ${fv(c.parsed.y)}`}}}}
      })
    }
    return () => { chartRef.current?.destroy() }
  }, [ch])

  const downloadPNG = () => {
    if (!canvasRef.current) return
    const isDark = document.documentElement.dataset.theme !== 'light'
    const src = canvasRef.current
    const tmp = document.createElement('canvas'); tmp.width=src.width; tmp.height=src.height
    const ctx = tmp.getContext('2d')!
    ctx.fillStyle = isDark ? '#13131f' : '#ffffff'
    ctx.fillRect(0,0,tmp.width,tmp.height); ctx.drawImage(src,0,0)
    const a = document.createElement('a')
    a.download = ch.title.replace(/\s+/g,'-')+'.png'; a.href=tmp.toDataURL('image/png',1); a.click()
  }

  const tall = ch.type==='line'||ch.type==='radar'

  return (
    <div className={`chart-card ${ch.span===2?'span2':''}`}>
      <div className="chart-hdr">
        <div>
          {isFirst && recommendation && <div className="rec-badge">✦ {recommendation.length>60?recommendation.slice(0,60)+'…':recommendation}</div>}
          <div className="chart-title">{ch.title}</div>
        </div>
        <div className="chart-actions">
          {/* Download PNG */}
          <button className="chart-act-btn" onClick={downloadPNG} title="Download chart as PNG">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l4 4 4-4"/><line x1="12" y1="8" x2="12" y2="16"/>
            </svg>
          </button>
          {/* Download CSV */}
          {tableRows.length > 0 && (
            <button className="chart-act-btn" onClick={() => downloadCSV(tableHeaders, tableRows, ch.title)} title="Download data as CSV">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="chart-sub">{ch.subtitle}</div>
      <div className={`chart-wrap ${tall?'tall':''}`}><canvas ref={canvasRef} id={cid}/></div>
    </div>
  )
}

// ── ThreadItem ────────────────────────────────────────────────────────────────
const AI_LABELS: Record<string,string> = { gemini:'Gemini 2.5 Flash' }

export default function ThreadItem({ thread, index, onFollowUp }: {
  thread: Thread; index: number; onFollowUp: (q: string) => void
}) {
  const r = thread.result as DashboardResult
  const speakBtnRef = useRef<HTMLButtonElement>(null)
  const speakingRef = useRef(false)

  const speakInsight = () => {
    if (!window.speechSynthesis) return
    if (speakingRef.current) {
      window.speechSynthesis.cancel(); speakingRef.current=false
      speakBtnRef.current?.classList.remove('speaking'); return
    }
    const text = r.insight.replace(/\*\*(.*?)\*\*/g,'$1').replace(/\s+/g,' ').trim()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate=0.95; utt.lang='en-US'
    const voices = window.speechSynthesis.getVoices()
    const v = voices.find(v=>v.name.includes('Google')||v.lang==='en-US')??voices[0]
    if (v) utt.voice=v
    utt.onstart=()=>{ speakingRef.current=true; speakBtnRef.current?.classList.add('speaking') }
    utt.onend=utt.onerror=()=>{ speakingRef.current=false; speakBtnRef.current?.classList.remove('speaking') }
    window.speechSynthesis.speak(utt)
  }

  const cols = r.charts?.length===2 ? 'cols-2' : r.charts?.length>=3 ? 'cols-3' : 'cols-1'
  const tHeaders = r.table?.headers ?? []
  const tRows    = r.table?.rows ?? []

  return (
    <div className="thread-item" id={thread.id} style={{ animationDelay:`${Math.min(index,3)*0.06}s` }}>

      {/* Query label — rule line style */}
      <div className="q-label">
        <div className="q-rule" style={{width:2,background:`linear-gradient(to bottom, var(--punch), transparent)`,alignSelf:'stretch',flexShrink:0,borderRadius:1}}/>
        <div className="q-pill"><div className="q-pip"/>{thread.query}</div>
      </div>

      {/* Insight */}
      {r.insight && (
        <div className="insight-panel">
          <div className="insight-meta">
            <span className="insight-label">Analysis</span>
            <span className="engine-tag">{AI_LABELS[r.aiEngine]??r.aiEngine}</span>
            {r.isLocalFallback && <span className="engine-tag local-tag">local fallback</span>}
          </div>
          <div className="insight-text" dangerouslySetInnerHTML={{__html:r.insight.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}}/>
          {r.anomalies?.length>0 && (
            <div className="atag-row">
              {r.anomalies.map((a,i)=>(
                <div key={i} className={`atag ${a.type}`}>
                  {a.type==='warn'?'⚠':a.type==='info'?'◈':'✕'} {a.text}
                </div>
              ))}
            </div>
          )}
          <button className="speak-btn" ref={speakBtnRef} onClick={speakInsight}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            Speak result
          </button>
        </div>
      )}

      {/* KPIs */}
      {r.kpis?.length>0 && (
        <div className="kpi-row">
          {r.kpis.map((k,i)=>(
            <div key={i} className={`kpi-card ${k.color}`}>
              <div className="kpi-lbl">{k.label}</div>
              <div className="kpi-val">{k.value}</div>
              <div className="kpi-sub">{k.sub}</div>
              {k.trend!=='none'&&<div className={`kpi-trend ${k.trend}`}>{k.trend==='up'?'↑ Positive':'↓ Watch'}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {r.charts?.length>0 && (
        <div className={`chart-grid ${cols}`}>
          {r.charts.map((ch,ci)=>(
            <ChartCard key={ci} ch={ch} cid={`c-${thread.id}-${ci}`}
              isFirst={ci===0} recommendation={r.chartRecommendation??''}
              tableHeaders={tHeaders} tableRows={tRows}/>
          ))}
        </div>
      )}

      {/* Table */}
      {r.table?.show && tRows.length>0 && (
        <div className="chart-card" style={{marginTop:'.85rem'}}>
          <div className="chart-hdr">
            <div><div className="chart-title">Detailed Breakdown</div><div className="chart-sub">{tRows.length} entries</div></div>
            <div className="chart-actions">
              <button className="chart-act-btn" onClick={()=>downloadCSV(tHeaders,tRows,'breakdown')} title="Download as CSV">
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
              </button>
            </div>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr>{tHeaders.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
              <tbody>
                {tRows.map((row,ri)=>(
                  <tr key={ri}>{row.map((cell,ci)=>(
                    <td key={ci}>{ci===0?<span className={`rbadge ${ri===0?'g':ri===1?'s':ri===2?'b':''}`}>{cell}</span>:cell}</td>
                  ))}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Follow-ups */}
      {r.followups?.length>0 && (
        <div className="fstrip">
          <div className="flbl">Suggested follow-ups</div>
          {r.followups.map((f,i)=>(
            <div key={i} className="fchip" onClick={()=>onFollowUp(f)}>
              <svg viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" d="M5 12h14M12 5l7 7-7 7"/></svg>
              {f}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

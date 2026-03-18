'use client'
import { useState } from 'react'
import { useAppStore, useActiveTab } from '@/store/appStore'
import { AMAZON_PROFILE } from '@/lib/csvProcessor'
import type { AIEngine } from '@/types'

const AI_OPTIONS: Array<{ id: AIEngine; name: string; sub: string }> = [
  { id: 'gemini', name: 'Gemini 2.5 Flash', sub: 'Google · free tier' },
  { id: 'claude', name: 'Claude Haiku',     sub: 'Anthropic · free tier' },
]

export default function Header({ onCSVUpload }: { onCSVUpload: (f: File) => void }) {
  const { tabs, activeTabId, activeAI, theme, setTheme, setActiveAI, closeTab, switchTab, clearThreads, addTab } = useAppStore()
  const [aiOpen, setAiOpen] = useState(false)
  const activeTab = useActiveTab()

  const aiLabel: Record<string, string> = { gemini: 'Gemini', claude: 'Claude' }

  return (
    <header className="header">
      {/* Logo */}
      <div className="logo-mark">
        <div className="logo-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5">
            <path d="M2 12 L5 7 L8 9 L11 4 L14 6" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="14" cy="6" r="1.5" fill="white" stroke="none"/>
          </svg>
        </div>
        <span className="logo-word">FL<em>OW</em></span>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {tabs.map(t => (
          <div key={t.id} className={`tab ${t.id === activeTabId ? 'active' : ''}`} onClick={() => switchTab(t.id)}>
            <span className="tab-name">{t.name}</span>
            <button className="tab-close" onClick={e => { e.stopPropagation(); closeTab(t.id) }}>×</button>
          </div>
        ))}
        <button className="tab-new" onClick={() => addTab({ id: `tab-${Date.now()}`, name: 'New chart', threads: [], dataset: AMAZON_PROFILE })}>+ New</button>
      </div>

      {/* Right */}
      <div className="hdr-right">
        <div className="live-badge">
          <div className="live-dot" />
          <span>{activeTab?.dataset?.name ?? 'Amazon Sales'} · {(activeTab?.dataset?.rowCount ?? 50000).toLocaleString()} rows</span>
        </div>

        {/* Upload CSV */}
        <label className="hdr-btn" title="Upload CSV" style={{ cursor: 'pointer' }}>
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <input type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onCSVUpload(f); e.target.value = '' }} />
        </label>

        {/* Clear */}
        <button className="hdr-btn" title="Clear results" onClick={() => clearThreads(activeTabId)}>
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
          </svg>
        </button>

        {/* Theme */}
        <button className="hdr-btn" title="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark'
            ? <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            : <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
          }
        </button>

        {/* AI selector — only Gemini + Claude */}
        <div className="ai-wrap">
          <button className="ai-pill" onClick={() => setAiOpen(o => !o)}>
            <span className={`ai-dot ${activeAI}`} />
            <span>{aiLabel[activeAI] ?? activeAI}</span>
            <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {aiOpen && (
            <div className="ai-menu open">
              <div className="ai-menu-lbl">AI Engine</div>
              {AI_OPTIONS.map(o => (
                <div key={o.id} className={`ai-opt ${activeAI === o.id ? 'active' : ''}`}
                  onClick={() => { setActiveAI(o.id); setAiOpen(false) }}>
                  <span className={`ai-opt-dot ${o.id}`} />
                  <div>
                    <div className="ai-opt-name">{o.name}</div>
                    <div className="ai-opt-sub">{o.sub}</div>
                  </div>
                  {activeAI === o.id && <span className="ai-check">✓</span>}
                </div>
              ))}
              <div className="ai-note">Keys in .env.local</div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
